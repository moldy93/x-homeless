import { NoForYouController } from "./enforcer";

declare global {
  interface Window {
    __noForYouController?: NoForYouController;
  }
}

if (!window.__noForYouController) {
  const controller = new NoForYouController(window);
  window.__noForYouController = controller;
  controller.start();
}

