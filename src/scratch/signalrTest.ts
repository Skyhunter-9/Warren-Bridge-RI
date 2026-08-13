//how to run:
// npx tsx src/scratch/signalrTest.ts


import { HubConnectionBuilder } from "@microsoft/signalr";
import { MessagePackHubProtocol } from "@microsoft/signalr-protocol-msgpack"

const connection = new HubConnectionBuilder()
    // within geo-instruments f12 this is what is displayed for a /negotiate:
    // https://geocloud.geo-instruments.com/LiveDataHub/negotiate?negotiateVersion=1
    // Can trim down anything that involves negotiate
    .withUrl("https://geocloud.geo-instruments.com/LiveDataHub")
    .withHubProtocol(new MessagePackHubProtocol())
    .build();

connection.start()
    // below comment silences an error
    // eslint-disable-next-line no-console
    .then(() => console.log("connected"))
    // eslint-disable-next-line no-console
    .catch((err) => console.error("Connection failed:", err));