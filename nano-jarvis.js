#!/usr/bin/env node

const fs = require('fs');
const http = require('http');

const LLM_API_BASE_URL = process.env.LLM_API_BASE_URL;
const LLM_API_KEY = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
const LLM_CHAT_MODEL = process.env.LLM_CHAT_MODEL;

const chat = async (messages) => {
    const url = `${LLM_API_BASE_URL}/chat/completions`;
    const auth = LLM_API_KEY ? { 'Authorization': `Bearer ${LLM_API_KEY}` } : {};
    const model = LLM_CHAT_MODEL || 'gpt-3.5-turbo';
    const max_tokens = 200;
    const temperature = 0;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ messages, model, max_tokens, temperature })
    });
    if (!response.ok) {
        throw new Error(`HTTP error with the status: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const { choices } = data;
    const first = choices[0];
    const { message } = first;
    const { content } = message;
    return content.trim();
}

const SYSTEM_PROMPT = 'Answer the user concisely and politely.';

(async () => {
    if (!LLM_API_BASE_URL) {
        console.error('Fatal error: LLM_API_BASE_URL is not set!');
        process.exit(-1);
    }
    console.log(`Using LLM at ${LLM_API_BASE_URL} (model: ${LLM_CHAT_MODEL || 'default'}).`);

    const messages = [];

    const server = http.createServer(async (request, response) => {
        const { url } = request;
        if (url === '/health') {
            response.writeHead(200).end('OK');
        } else if (url === '/' || url === '/index.html') {
            response.writeHead(200, { 'Content-Type': 'text/html' });
            response.end(fs.readFileSync('./index.html'));
        } else if (url.startsWith('/chat/q')) {
            const parsedUrl = new URL(`http://localhost/${url}`);
            const { search } = parsedUrl;
            const query = decodeURIComponent(search.substring(1));
            console.log('    Human:', query);
            if (messages.length === 0) {
                messages.push({ role: 'system', content: SYSTEM_PROMPT });
            }
            messages.push({ role: 'user', content: query });
            response.writeHead(200).end(query);
        } else if (url.startsWith('/chat/a')) {
            const start = Date.now();
            const answer = await chat(messages);
            const elapsed = Date.now() - start;
            response.writeHead(200).end(answer);
            console.log('Assistant:', answer);
            console.log('       (in', elapsed, 'ms)');
            console.log();
            messages.push({ role: 'assistant', content: answer });
        } else {
            console.error(`${url} is 404!`)
            response.writeHead(404);
            response.end();
        }
    });

    const port = process.env.PORT || 5000;
    server.listen(port);
    console.log('Listening on port', port);
})();
