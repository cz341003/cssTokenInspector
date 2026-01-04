<script setup lang="ts">
import { ref, onMounted } from 'vue';

const isActive = ref(false);

const toggleInspector = async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    try {
      const res = await browser.runtime.sendMessage({ 
        type: 'POPUP_TOGGLE', 
        tabId: tab.id 
      });
      if (res) {
        isActive.value = res.active;
        if (res.active) {
          window.close();
        }
      }
    } catch (e) {
      console.error('Failed to toggle inspector:', e);
    }
  }
};

onMounted(async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    try {
      const res = await browser.runtime.sendMessage({ 
        type: 'POPUP_GET_STATE', 
        tabId: tab.id 
      });
      if (res) {
        isActive.value = res.active;
      }
    } catch (e) {
      console.error('Failed to get inspector state:', e);
    }
  }
});
</script>

<template>
  <div class="popup-container">
    <h1>Style Inspector</h1>
    <button 
      @click="toggleInspector" 
      :class="{ active: isActive }"
    >
      {{ isActive ? 'Disable' : 'Enable' }} Inspector
    </button>
    <p class="hint">Click the button or press Ctrl+Shift+X to toggle.</p>
  </div>
</template>

<style scoped>
.popup-container {
  width: 200px;
  padding: 16px;
  text-align: center;
  background-color: #1f2937;
  color: white;
}

h1 {
  font-size: 18px;
  margin-bottom: 16px;
  color: #60a5fa;
}

button {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 6px;
  background-color: #3b82f6;
  color: white;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.2s;
}

button:hover {
  background-color: #2563eb;
}

button.active {
  background-color: #ef4444;
}

button.active:hover {
  background-color: #dc2626;
}

.hint {
  margin-top: 12px;
  font-size: 12px;
  color: #9ca3af;
}
</style>
