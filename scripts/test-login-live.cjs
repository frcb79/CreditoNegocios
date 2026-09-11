const https = require('https');

function testLive(endpoint, postData) {
  return new Promise((resolve, reject) => {
    const dataString = JSON.stringify(postData);
    const options = {
      hostname: 'creditonegocios-staging.up.railway.app',
      port: 443,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataString),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body,
        });
      });
    });

    req.on('error', reject);
    req.write(dataString);
    req.end();
  });
}

async function run() {
  console.log('--- TESTING francocb79@gmail.com ---');
  const res1 = await testLive('/api/auth/login', {
    email: 'francocb79@gmail.com',
    password: 'Prueba1$',
  });
  console.log('Status:', res1.statusCode);
  console.log('Set-Cookie:', res1.headers['set-cookie']);
  console.log('Body:', res1.body);

  console.log('\n--- TESTING fcb@creditonegocios.com.mx ---');
  const res2 = await testLive('/api/auth/login', {
    email: 'fcb@creditonegocios.com.mx',
    password: 'Prueba1$',
  });
  console.log('Status:', res2.statusCode);
  console.log('Set-Cookie:', res2.headers['set-cookie']);
  console.log('Body:', res2.body);

  console.log('\n--- TESTING francocb79@yahoo.com ---');
  const res3 = await testLive('/api/auth/login', {
    email: 'francocb79@yahoo.com',
    password: 'Prueba1$',
  });
  console.log('Status:', res3.statusCode);
  console.log('Set-Cookie:', res3.headers['set-cookie']);
  console.log('Body:', res3.body);

  console.log('\n--- TESTING FORGOT PASSWORD FOR francocb79@gmail.com ---');
  const resForgot = await testLive('/api/auth/forgot-password', {
    email: 'francocb79@gmail.com',
  });
  console.log('Status:', resForgot.statusCode);
  console.log('Body:', resForgot.body);
}

run().catch(console.error);
