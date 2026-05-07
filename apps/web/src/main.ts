import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";

const wsUrl = (import.meta.env.VITE_WS_URL as string | undefined) ?? undefined;

const app = mount(App, {
  target: document.getElementById("app")!,
  props: { wsUrl },
});

export default app;
