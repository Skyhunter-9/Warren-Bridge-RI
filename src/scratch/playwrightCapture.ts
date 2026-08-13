//How to run:
// npx tsx src/scratch/playwrightCapture.ts

import { BrowserContext, chromium, Page } from "@playwright/test";
import { MessagePackHubProtocol } from "@microsoft/signalr-protocol-msgpack";
import { MessageType } from "@microsoft/signalr";
import { createServer } from "http";

const GRAPH_URLS = {
    z: "https://geocloud.geo-instruments.com/Graphs/GetGraph/a78b0d65-04a5-477b-9891-843d1e89932d?projectId=6006f7a5-3e0b-47cd-ade7-6f3a738b60f0",
    e: "https://geocloud.geo-instruments.com/Graphs/GetGraph/c530580d-051f-43bf-856a-7b9173f53801?projectId=6006f7a5-3e0b-47cd-ade7-6f3a738b60f0",
    n: "https://geocloud.geo-instruments.com/Graphs/GetGraph/6c3988c5-e369-47b7-84d2-9621e31febed?projectId=6006f7a5-3e0b-47cd-ade7-6f3a738b60f0",
};

//taking GNSS data and converting it into format my dashboard expects
//interface describes the shape the row is allowed to have
interface GnssRow {
    timestamp: number;
    time: string;
    //means plus any number of fields that follow this
    [key: string]: number | string;
}

// creates an empty container telling typescript keys will be timestamps
// and values will be GnssRow objects
const gnssRows = new Map<number, GnssRow>();

async function watchGraph(
    context: BrowserContext,
    url: string,
    axis: string,
    protocol: MessagePackHubProtocol,
    noopLogger: { log: () => void }
): Promise<Page> {
    const page = await context.newPage();

    //listener goes before page.goto so it catches everything when page opens
    page.on("websocket", (ws) => {
        //eslint-disable-next-line no-console
        console.log(`[${axis}] websocket opened:`, ws.url());

        ws.on("framereceived", (frame) => {
            if (typeof frame.payload === "string") return; // skip any text frames

            const buffer = frame.payload;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

            try {
                const messages = protocol.parseMessages(arrayBuffer, noopLogger);
                for (const message of messages) {
                    //SignalR message type 1 is "Invocation" easy fix with importing messagetype and changing 1 to invocation 
                    if (message.type === MessageType.Invocation && message.target === "UpdateGraph"){
                        ingestUpdateGraphMessage(message);
                    }
                    //eslint-disable-next-line no-console
                    console.log(`[${axis}] decoded message:`, JSON.stringify(message, null, 2));
                }
            } catch (err) {
                //eslint-disable-next-line no-console
                console.error(`[${axis}] Failed to parse frame (length ${buffer.byteLength}):`, err);
            }
        });
    });

    await page.goto(url);
    return page;
}

function startServer(port:number) {
    const server = createServer((req, res) => {
        // Without this header, the browser blocks your dashboard (localhost:3000) from
        // reading this response at all, since it's a different port = a different "origin"
        // as far as the browser's CORS security rules are concerned - the exact same rule
        // that originally blocked a direct connection to GeoCloud, just applied to our own
        // local server this time. "*" means "any origin may read this" - fine for a local
        // dev-only script like this one.
        res.writeHead(200, {"content-Type": "text/csv", "Access-Control-Allow-Origin": "*"});
        res.end(buildCSVText());
    });

    server.listen(port, () => {
        // eslint-disable-next-line no-console
        console.log(`Server GNSSperiodic data on http://localhost:${port}`);
    });
}


async function main() {
    startServer(4000);
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();

    const protocol = new MessagePackHubProtocol();
    const noopLogger = { log: () => { } };

    //log into z graph first
    const zPage = await watchGraph(context, GRAPH_URLS.z, "Z", protocol, noopLogger);
    

    // Pauses the script here and opens the Playwright Inspector window.
    // Log into the site manually in the browser window that just opened,
    // then click "Resume" (▶) in the Inspector to let the script continue.
    await zPage.pause();

    //now after successful login launch remaining graphs
    //this way there is only one login screen and the other graphs are launched automatically
    const ePage = await watchGraph(context, GRAPH_URLS.e, "E", protocol, noopLogger);
    const nPage = await watchGraph(context, GRAPH_URLS.n, "N", protocol, noopLogger);


    // eslint-disable-next-line no-console
    console.log("Resumed. Current URLs:", zPage.url(), ePage.url(), nPage.url());

    //reloads the logged in tab every 30 minutes to update data in dashboard
    const RELOAD_INTERVAL_MS = 1 * 60 * 1000; // 1 minute for test
    setInterval(() => {
        // eslint-disable-next-line no-console
        console.log("Reloading logged-in tab to refresh data...");
        // eslint-disable-next-line no-console
        zPage.reload().catch((err) => console.error("Failed to reload Z page:", err));
        // eslint-disable-next-line no-console
        ePage.reload().catch((err) => console.error("Failed to reload E page:", err));
        // eslint-disable-next-line no-console
        nPage.reload().catch((err) => console.error("Failed to reload N page:", err));
    }, RELOAD_INTERVAL_MS);
}

// can't use main(); need a catch because async function main()
// returns a "Promise" we need a catch to catch whether the promise
// was resolved or rejected

// eslint-disable-next-line no-console
main().catch((err) => console.error("Fatal error", err));

//arguments[0] is graph ID
//arguments[1] is array of sensor objects

function ingestUpdateGraphMessage(message: any) {
    const sensors = message.arguments[1];
    
    for (const sensor of sensors) {

        //^ means start of string
        //(/d+) means capture one or more digits
        //ENZ means capture exactly one letter from the axis
        //$ means end of string
        const match = /^GNSS(\d+)_([ENZ])$/.exec(sensor.Name);
        if (!match) continue;

        const nodeIndex = parseInt(match[1], 10) - 1;
        const axis = match[2];
        const key = `gnss_${nodeIndex}_${axis}`;

        for (const [isoTimestamp, value] of Object.entries(sensor.Data)) {
            const timestamp = Date.parse(isoTimestamp);

            let row = gnssRows.get(timestamp);
            if (!row) {
                row = {
                    timestamp,
                    time: new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false}),

                };
                gnssRows.set(timestamp, row);
            }
            
            row[key] = value as number;
        }
    }
}

function buildCSVText(): string {
    const rows = [...gnssRows.values()].sort((a, b) => a.timestamp - b.timestamp);

    const columns = new Set<string>();
    for (const row of rows) {
        for (const key of Object.keys(row)) {
            if (key !== "timestamp" && key !== "time") columns.add(key);
        }
    }
    const columnList = [...columns];

    const header = ["timestamp", ...columnList].join(",");
    const lines = rows.map((row) => {
        const timestampText = new Date(row.timestamp).toISOString();
        const values = columnList.map((col) => (col in row ? String(row[col]) : ""));
        return [timestampText, ...values].join(",");
    });

    return [header, ...lines].join("\n");
}