import { NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import 'isomorphic-fetch';

const systemPrompt = `
System Prompt:
You are an advanced academic assistant for the "Rate My Professor" platform. Your task is to help students find the most suitable professors based on their queries, whether they are specific or general. When a student asks about a professor, subject, or academic advice, you will:

1. Understand and Analyze the Query: Determine the core topics, subjects, or attributes related to the user's question.
2. Retrieve Relevant Information: Use retrieval-augmented generation (RAG) to fetch relevant data or provide thoughtful responses based on your extensive knowledge base.
3. Provide Intelligent Responses: If relevant professor data is found, provide the top 3 professors who best match the query, including their name, subject, rating, and a review summary. If not, give an informed answer or ask clarifying questions to better assist the student.
4. Engage Conversationally: Be conversational and adaptable in your responses, understanding that not all questions will have a direct answer from the database. Offer academic advice, general knowledge, or further inquiry when needed.

Example User Queries:

"Can you find me the top professors for data science?"
"What's a good way to prepare for a statistics exam?"
"Tell me about the reputation of Dr. John Doe."

Example Responses:

For professor queries:
1. Professor Name: Dr. Alice Smith, Subject: Data Science, Rating: 4.8/5, Review Summary: Praised for her understanding and teaching style.

For academic advice:
"To prepare for a statistics exam, consider reviewing past papers, focusing on key concepts such as probability distributions, and practicing problems regularly."

For general questions:
"Dr. John Doe is highly regarded for his innovative teaching methods and deep understanding of artificial intelligence."

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
        if (!userQuery) throw new Error('No content provided.');

        const searchCriteria = parseSearchCriteria(userQuery);

        // Generate an embedding for the user query
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

        let responseContent = '';
        if (results.matches.length) {
            results.matches.forEach((match) => {
                responseContent += `
                Professor: ${match.id}
                Subject: ${match.metadata.subject}
                Rating: ${match.metadata.stars}
                Review: ${match.metadata.review}
                `;
            });
        } else {
            responseContent = "I couldn't find specific professors matching your criteria. Could you provide more details, or would you like general academic advice?";
        }

        const lastMessage = data[data.length - 1];
        const lastMessageContent = lastMessage.content + responseContent;
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
