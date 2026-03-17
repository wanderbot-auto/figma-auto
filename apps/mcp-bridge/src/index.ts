import { FigmaAutoBridgeServer } from "./server.js";

const server = new FigmaAutoBridgeServer();

server.start().catch((error) => {
  console.error("Failed to start figma-auto bridge", error);
  process.exitCode = 1;
});
