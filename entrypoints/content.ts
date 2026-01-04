import { createApp } from 'vue';
import InspectorOverlay from '@/components/InspectorOverlay.vue';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  main() {
    // Mount the overlay in all frames to enable mouse tracking
    // The UI itself will only be visible in the top frame
    const container = document.createElement('div');
    container.id = 'element-style-inspector-root';
    Object.assign(container.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '0',
      height: '0',
      zIndex: '2147483647',
      pointerEvents: 'none',
    });
    document.body.appendChild(container);

    const app = createApp(InspectorOverlay);
    app.mount(container);
  },
});
