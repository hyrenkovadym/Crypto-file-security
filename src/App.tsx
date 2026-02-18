import "./App.css";
import AppHeader from "./components/AppHeader";
import { AppRoutes } from "./app/routes";

export default function App() {
  return (
    <div className="mp-app">
      <AppHeader />
      <AppRoutes />
    </div>
  );
}
