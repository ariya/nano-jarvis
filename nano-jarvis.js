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
    const max_tokens = 400;
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

const REPLY_PROMPT = `You are a helpful answering assistant.
Your task is to reply and respond to the user politely and concisely.
Answer in plain text (concisely, maximum 3 sentences) and not in Markdown format.`;

const reply = async (context) => {
    const { inquiry, history } = context;

    const messages = [];
    messages.push({ role: 'system', content: REPLY_PROMPT });
    const relevant = history.slice(-4);
    relevant.forEach(msg => {
        const { inquiry, answer } = msg;
        messages.push({ role: 'user', content: inquiry });
        messages.push({ role: 'assistant', content: answer });
    });
    messages.push({ role: 'user', content: inquiry });
    const answer = await chat(messages);

    return { answer, ...context };
}

(async () => {
    if (!LLM_API_BASE_URL) {
        console.error('Fatal error: LLM_API_BASE_URL is not set!');
        process.exit(-1);
    }
    console.log(`Using LLM at ${LLM_API_BASE_URL} (model: ${LLM_CHAT_MODEL || 'default'}).`);

    const history = [];
    let inquiry;

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
            inquiry = decodeURIComponent(search.substring(1));
            console.log('    Human:', inquiry);
            response.writeHead(200).end(inquiry);
        } else if (url.startsWith('/chat/a')) {
            const context = { inquiry, history };
            const start = Date.now();
            const result = await reply(context);
            const duration = Date.now() - start;
            const { answer } = result;
            response.writeHead(200).end(answer);
            console.log('Assistant:', answer);
            console.log('       (in', duration, 'ms)');
            console.log();
            history.push({ inquiry, answer, duration });
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
