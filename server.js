const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

// In-memory data store
const products = [
  { id: 1, name: 'T-Shirt', price_cents: 1999, stock: 12 },
  { id: 2, name: 'Hoodie', price_cents: 3999, stock: 7 },
  { id: 3, name: 'Cap', price_cents: 1299, stock: 20 },
  { id: 4, name: 'Socks', price_cents: 799, stock: 30 },
  { id: 5, name: 'Mug', price_cents: 1499, stock: 15 },
  { id: 6, name: 'Sticker Pack', price_cents: 499, stock: 50 },
  { id: 7, name: 'Backpack', price_cents: 5499, stock: 5 },
  { id: 8, name: 'Notebook', price_cents: 999, stock: 18 },
];

let nextOrderId = 1;

function sendJSON(res, status, obj) {
  const data = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function serveIndex(res) {
  const file = path.join(__dirname, 'index.html');
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('500 Internal Server Error');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  // Simple routing
  if (req.method === 'GET' && pathname === '/') {
    return serveIndex(res);
  }

  if (req.method === 'GET' && pathname === '/api/products') {
    return sendJSON(res, 200, products);
  }

  if (req.method === 'POST' && pathname === '/api/orders') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // Avoid excessively large payloads
      if (body.length > 1e6) req.socket.destroy();
    });
    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(body || '{}');
      } catch (e) {
        return sendJSON(res, 400, { error: 'Invalid JSON' });
      }

      const productId = Number(payload.productId);
      const quantity = Number(payload.quantity);

      if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity <= 0) {
        return sendJSON(res, 400, { error: 'productId and quantity must be positive integers' });
      }

      const product = products.find(p => p.id === productId);
      if (!product) {
        return sendJSON(res, 404, { error: 'Product not found' });
      }

      if (quantity > product.stock) {
        return sendJSON(res, 400, { error: 'Insufficient stock' });
      }

      product.stock -= quantity; // mutate in-memory stock
      const order = {
        id: nextOrderId++,
        productId,
        quantity,
        total_cents: product.price_cents * quantity,
      };
      return sendJSON(res, 201, order);
    });
    return; // keep handler open until 'end'
  }

  if (req.method === 'GET' && pathname === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`storefront listening on http://localhost:${PORT}`);
});
