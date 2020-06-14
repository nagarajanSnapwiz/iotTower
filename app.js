const express = require('express');
const app = express();
const cors = require('cors');
const expressWs = require('express-ws')(app);

let db = new Map();
let controllers = new Set();
app.use(cors())
function noop() { }

function heartbeat() {
    this.isAlive = true;
}

app.get('/test', function (req, res) {
    res.end("get route test");
});


app.get("/chip", (req, res) => {
    res.json([...db.keys()].map(k => ({ data: db.get(k).data, id: k })));
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
    controllers.add(ws);
    ws.on('message', function (msg) {
        const parsed = safeParseJson(msg);
        if (parsed) {
            const { id, update } = parsed;
            if (db.has(id)) {
                db.get(id).data = { ...db.get(id).data, ...update };
                db.get(id).ws.send(encodeForChip("update", update));
                ws.send(JSON.stringify({ type: "update", id, update: db.get(id).data }));
            }
        }
    });

    ws.on('close', function () {
        controllers.delete(ws);
    });
});

function removeClient(id) {
    db.delete(id);
    for (const ws of controllers) {
        try {
            ws.send(JSON.stringify({ type: "dbreset", update: [...db.keys()].map(k => ({ data: db.get(k).data, id: k })) }));
        } catch (e) {

        }
    }
}

function sendChipUpdate(id) {
    for (const ws of controllers) {
        try {
            ws.send(JSON.stringify({ type: "update", update: db.get(id).data, id }));
        } catch (e) {
            console.error('sending control error', e);
        }
    }
}

app.ws('/chip/:id', function (ws, req) {
    const { id } = req.params;
    ws.isAlive = true;
    if (!db.has(id)) {
        db.set(id, { ws, data: {} });
    } else {
        db.get(id).ws = ws;
    }
    sendChipUpdate(id);
    ws.on('pong', heartbeat);
    const interval = setInterval(function timeout() {
        if (ws.isAlive === false) {
            removeClient(id);
            return ws.terminate()
        };
        ws.isAlive = false;
        ws.ping(noop);
    }, 2000);

    ws.on('close', function () {
        removeClient(id);
        clearInterval(interval);
    });

    ws.on('message', function (msg) {
        const parsed = safeParseJson(msg);
        if (parsed && parsed.type === "update") {
            db.get(id).data = { ...db.get(id).data, ...parsed.update };
        }
    });
});

app.listen(8081);