// Ponto de entrada serverless do Vercel.
// O Vercel invoca este módulo como uma função; exportamos o app Express,
// que o runtime @vercel/node trata como (req, res) handler.
const app = require('../src/app');

module.exports = app;
