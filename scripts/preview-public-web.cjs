const express = require('express');
const path = require('node:path');
const app = express();
const root = path.resolve(__dirname, '../dist/public');
app.use('/api', (_req, res) => res.status(503).json({ message: 'Local preview: no backend connected.' }));
app.use(express.static(root));
app.get('*', (_req, res) => res.sendFile(path.join(root, 'index.html')));
app.listen(4173, '127.0.0.1', () => console.log('Local public review server ready'));
