const express = require('express');
const app = express();
const cors = require('cors');
const expressWs = require('express-ws')(app);

let db = new Map();
app.use(cors())


app.get('/test', function (req, res) {
    res.end("get route test");
});


app.get("/chip", (req, res) => {
    res.json([...db.keys()].map(k => db.get(k).data));
});

app.get("/chip/:id", (req, res) => {
    // console.log('row', { id: req.params.id, item: db.get(req.params.id) });
    res.json(db.get(req.params.id) && db.get(req.params.id).data);
});

function safeParseJson(jsonStr) {
    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        return false;
    }
}

function encodeForChip(type, data) {
    return `${type} ${Object.keys(data).map(x => `${x}:${data[x]}`).join(' ')}`;
}

app.ws('/control', function (ws, req) {
    ws.on('message', function (msg) {
        const parsed = safeParseJson(msg);
        if (parsed) {
            const { id, update } = parsed;
            if (db.has(id)) {
                db.get(id).data = { ...db.get(id).data, ...update };
                db.get(id).ws.send(encodeForChip("update", update));
            }
        }
    });
});


app.ws('/chip/:id', function (ws, req) {
    const { id } = req.params;
    if (!db.has(id)) {
        db.set(id, { ws, data: {} });
    } else {
        db.get(id).ws = ws;
    }

    ws.on('message', function (msg) {
        const parsed = safeParseJson(msg);
        if (parsed && parsed.type === "update") {
            db.get(id).data = { ...db.get(id).data, ...parsed.update };
        }
    });
});

app.listen(8081);