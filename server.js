import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, 'dist');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const server = createServer(async (req, res) => {
  try {
    const requestedPath = new URL(req.url || '/', `http://${req.headers.host}`).pathname;

    if (requestedPath === '/api/gemini') {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'GEMINI_API_KEY is not configured on the server.' }));
        return;
      }

      const rawBody = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => {
          data += chunk;
        });
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });

      if (!rawBody) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request body is empty.' }));
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(rawBody);
      } catch (parseError) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload.' }));
        return;
      }

      const prompt = typeof parsed?.prompt === 'string' && parsed.prompt.trim() ? parsed.prompt : undefined;
      const image = parsed?.image && typeof parsed.image === 'object' ? parsed.image : undefined;

      if (!prompt && !image) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Provide at least "prompt" or "image" in the payload.' }));
        return;
      }

      const imageData = image?.data;
      const imageMimeType = image?.mimeType;
      if (image) {
        if (typeof imageData !== 'string' || !imageData.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'image.data must be a base64 string.' }));
          return;
        }

        if (imageMimeType && typeof imageMimeType !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'image.mimeType must be a string when provided.' }));
          return;
        }
      }

      const requestBody = {
        contents: [
          {
            parts: [
              ...(prompt ? [{ text: prompt }] : []),
              ...(image
                ? [
                    {
                      inline_data: {
                        mime_type: imageMimeType || 'image/png',
                        data: imageData,
                      },
                    },
                  ]
                : []),
            ],
          },
        ],
      };

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          res.writeHead(response.status, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'Gemini API request failed.',
              details: errorText,
            })
          );
          return;
        }

        const result = await response.json();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      } catch (apiError) {
        console.error('Gemini API error:', apiError);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to reach Gemini API.' }));
        return;
      }
    }
    const filePath = path.join(distPath, requestedPath);
    const resolvedPath = existsSync(filePath) && (await stat(filePath)).isFile()
      ? filePath
      : path.join(distPath, 'index.html');

    const data = await readFile(resolvedPath);
    const ext = path.extname(resolvedPath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
    console.error('Server error:', error);
  }
});

const port = process.env.PORT || 4173;
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
