const http = require('http');

const subscriptionPayload = {
    endpoint: "https://fcm.googleapis.com/fcm/send/e1...",
    keys: {
        p256dh: "BM...",
        auth: "..."
    }
};

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/notifications/subscribe',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        console.log('BODY:', data);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(JSON.stringify(subscriptionPayload));
req.end();
