'use client'
import { Stack, Box, TextField, Button, useMediaQuery } from "@mui/material";
import { useState } from "react";

export default function Home() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hey I am the AI Rate My Professor Bot, how may I help you?"
    }
  ]);

  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');

  const isMobile = useMediaQuery('(max-width:600px)'); // Check if the screen width is less than 600px

  const sendMessage = async () => {
    setMessages((messages) => [
      ...messages,
      { role: "user", content: message },
      { role: "assistant", content: '' },
    ]);

    setMessage('');

    const response = fetch('api/chat', {
      method: "POST",
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([...messages, { role: "user", content: message }])
    }).then(async (res) => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let result = '';
      return reader.read().then(function processText({ done, value }) {
        if (done) {
          return result;
        }
        const text = decoder.decode(value || new Uint8Array(), { stream: true });
        setMessages((messages) => {
          let lastMessage = messages[messages.length - 1];
          let otherMessages = messages.slice(0, messages.length - 1);
          return [
            ...otherMessages,
            { ...lastMessage, content: lastMessage.content + text },
          ];
        });

        return reader.read().then(processText);
      });
    });
  }

  return (
    <Box 
      width="100vw" 
      height="100vh" 
      display="flex" 
      flexDirection="column" 
      justifyContent="center" 
      alignItems="center"
      bgcolor="black" 
    >
      <Stack 
        direction="column"
        width={isMobile ? "90%" : "500px"} // Adjust width for mobile
        height={isMobile ? "80%" : "700px"} // Adjust height for mobile
        border="1px solid #333"
        p={2}
        spacing={3}
      >
        <Stack direction="column" spacing={2} flexGrow={1} overflow={"auto"} maxHeight={"100%"}>
          {messages.map((message, index) => (
            <Box key={index}
              display="flex"
              justifyContent={message.role === "assistant" ? 'flex-start' : 'flex-end'}
            >
              <Box 
                bgcolor={message.role === 'assistant' ? "#1e1e1e" : "#61dafb"} 
                color="white"
                borderRadius={16}
                p={isMobile ? 2 : 3} // Adjust padding for mobile
                sx={{ whiteSpace: 'pre-line' }} // Respect line breaks in the text
              >
                {message.content}
              </Box>
            </Box>
          ))}
        </Stack>
        <Stack
          direction="row"
          spacing={2}
        >
          <TextField
            label="Message"
            fullWidth
            value={message}
            onChange={(e) => {
              setMessage(e.target.value)
            }}
            InputProps={{ style: { color: 'white' } }} 
            InputLabelProps={{ style: { color: '#aaa' } }} 
            sx={{ bgcolor: '#333' }} 
          />
          <Button variant='contained' onClick={sendMessage} sx={{ bgcolor: '#61dafb', color: '#1e1e1e' }}>
            Send
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
