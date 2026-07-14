const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'farmxpert-secret-key-change-in-production';
console.log('Using secret:', JWT_SECRET);

// We just need a valid token to bypass the auth middleware. 
// It doesn't matter who it belongs to as long as they are SAAS_ADMIN, OWNER, or MANAGER
const token = jwt.sign(
    { userId: '11111111-1111-1111-1111-111111111111', role: 'SAAS_ADMIN' },
    JWT_SECRET,
    { expiresIn: '1h' }
);

console.log('\n--- TOKEN ---');
console.log(token);
console.log('-------------\n');

const http = require('http');

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/logs',
    method: 'GET',
    headers: {
        'Authorization': 'Bearer ' + token
    }
};

const req = http.request(options, (res) => {
    let raw = '';
    res.on('data', (d) => raw += d);
    res.on('end', () => {
        console.log('Status Code:', res.statusCode);
        try {
            console.log('Response:', JSON.parse(raw));
        } catch (e) {
            console.log('Raw text:', raw);
        }
    });
});

req.on('error', (e) => console.error('Connection error:', e));
req.end();
