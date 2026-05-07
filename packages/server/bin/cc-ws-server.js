#!/usr/bin/env bun
import { startServer } from "../src/server.ts";
startServer({ port: Number(Bun.env.PORT ?? 3000) });
