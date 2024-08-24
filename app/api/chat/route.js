import { NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import 'isomorphic-fetch';

const systemPrompt = `
System Prompt:
You are a highly advanced academic assistant for the "Rate My Professor" platform. Your task is to help students find the most suitable professors based on their queries. When a student asks about a professor or subject, you will:

Understand the Query: Analyze the student's question to identify key topics, subjects, or attributes related to the professors they are looking for.

Retrieve Relevant Information: Use retrieval-augmented generation (RAG) to fetch relevant professor data based on the query. This involves searching through a comprehensive database of professor ratings, specialties, and reviews.

Provide Top Recommendations: Select and present the top 3 professors who best match the student’s query. Include the following details for each professor:

Name: The name of the professor.
Subject: The primary subjects the professor teaches.
Rating: The overall rating or score given by students.
Review Summary: A brief summary of student reviews highlighting key strengths or weaknesses.
Maintain Accuracy and Relevance: Ensure that the information is up-to-date, accurate, and relevant to the student’s query. Provide recommendations that align with the student's preferences and needs.

Example User Query:

"Can you find me the top professors for data science?"
Example Response:

Dr. Alice Smith

Subject: Data Science, Machine Learning
Rating: 4.8/5
Review Summary: Dr. Smith is highly praised for her comprehensive understanding of data science and engaging teaching style.
Professor John Doe

Subject: Data Science, Artificial Intelligence
Rating: 4.7/5
Review Summary: Professor Doe is known for his practical approach to teaching and real-world applications of data science.
Dr. Emily Johnson

Subject: Data Science, Big Data
Rating: 4.6/5
Review Summary: Dr. Johnson receives excellent feedback for her in-depth knowledge and clear explanations of complex topics.
`;

export async function POST(req) {
    try {
        const data = await req.json();

        const pc = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY,
        });

        const index = pc.index('rag').namespace('ns1');
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        const userQuery = data[data.length - 1]?.content || '';
        const searchCriteria = parseSearchCriteria(userQuery);

        if (!userQuery) throw new Error('No content provided.');

        const embedding = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: userQuery,
            encoding_format: 'float',
        });

        const queryOptions = {
            topK: 3,
            includeMetadata: true,
            vector: embedding.data[0].embedding,
        };

        if (Object.keys(searchCriteria).length > 0) {
            queryOptions.filter = searchCriteria;
        }

        const results = await index.query(queryOptions);

        if (!results.matches.length) throw new Error('No matching professors found.');

        let resultString = '\n\nReturned results from vector db:';
        results.matches.forEach((match) => {
            resultString += `\n
            Professor: ${match.id}
            Review: ${match.metadata.review}
            Subject: ${match.metadata.subject}
            Stars: ${match.metadata.stars}
            \n\n
            `;
        });

        const lastMessage = data[data.length - 1];
        const lastMessageContent = lastMessage.content + resultString;
        const lastDataWithoutLastMessage = data.slice(0, data.length - 1);
        const completion = await openai.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                ...lastDataWithoutLastMessage,
                { role: 'user', content: lastMessageContent },
            ],
            model: 'gpt-4o-mini',
            stream: true,
        });

        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                try {
                    for await (const chunk of completion) {
                        const content = chunk.choices[0]?.delta?.content;
                        if (content) {
                            const text = encoder.encode(content);
                            controller.enqueue(text);
                        }
                    }
                } catch (err) {
                    controller.error(err);
                } finally {
                    controller.close();
                }
            },
        });

        return new NextResponse(stream);

    } catch (error) {
        console.error('Error handling POST request:', error);
        return new NextResponse(JSON.stringify({ error: error.message }), { status: 500 });
    }
}

function parseSearchCriteria(query) {
    const criteria = {};
    const subjectMatch = query.match(/(subject|course|teach).*(\b\w+\b)/i);
    if (subjectMatch) criteria.subject = subjectMatch[2];

    const ratingMatch = query.match(/(rating|stars|score).*(\b\d+(\.\d+)?\b)/i);
    if (ratingMatch) criteria.rating = parseFloat(ratingMatch[2]);

    const keywordsMatch = query.match(/(focus|expertise|specialty).*(\b\w+\b)/i);
    if (keywordsMatch) criteria.keywords = keywordsMatch[2].toLowerCase();

    return criteria;
}
