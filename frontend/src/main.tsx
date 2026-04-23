import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

window.addEventListener("error", (event) => {
	console.error("[GlobalError]", {
		message: event.message,
		filename: event.filename,
		lineno: event.lineno,
		colno: event.colno,
		error: event.error
	});
});

window.addEventListener("unhandledrejection", (event) => {
	console.error("[UnhandledRejection]", event.reason);
});

console.info("[AppBoot] Starting app", {
	mode: import.meta.env.MODE,
	backendUrl: import.meta.env.VITE_BACKEND_URL || "(unset)",
	hasGoogleClientId: Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)
});

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Root element #root not found");
}

createRoot(rootElement).render(<App />);
