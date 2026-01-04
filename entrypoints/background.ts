export default defineBackground(() => {
  const getTabKey = (tabId: number) => `tab_active_${tabId}`;

  // Handle keyboard commands
  browser.commands.onCommand.addListener(async (command) => {
    if (command === 'toggle-inspector') {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id !== undefined) {
        const key = getTabKey(tab.id);
        const state = await browser.storage.local.get(key);
        const next = !state[key];
        await browser.storage.local.set({ [key]: next });
      }
    }
  });

  // Handle messages from popup and content scripts
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'POPUP_TOGGLE') {
      const tabId = message.tabId;
      if (tabId === undefined) {
        sendResponse({ active: false });
        return false;
      }
      const key = getTabKey(tabId);
      browser.storage.local.get(key).then(async (state) => {
        const next = !state[key];
        await browser.storage.local.set({ [key]: next });
        sendResponse({ active: next });
      }).catch(err => {
        console.error('Storage error in POPUP_TOGGLE:', err);
        sendResponse({ active: false });
      });
      return true; // Keep channel open for async response
    }

    if (message.type === 'POPUP_GET_STATE') {
      const tabId = message.tabId;
      if (tabId === undefined) {
        sendResponse({ active: false });
        return false;
      }
      const key = getTabKey(tabId);
      browser.storage.local.get(key).then((res) => {
        sendResponse({ active: !!res[key] });
      }).catch(err => {
        console.error('Storage error in POPUP_GET_STATE:', err);
        sendResponse({ active: false });
      });
      return true;
    }

    if (message.type === 'SET_TAB_STATE') {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) {
        browser.storage.local.set({ [getTabKey(tabId)]: message.value });
      }
      return false;
    }

    if (message.type === 'IFRAME_STYLE_UPDATE') {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) {
        browser.tabs.sendMessage(tabId, {
          type: 'FROM_IFRAME_STYLE_UPDATE',
          data: message.data,
          frameId: sender.frameId
        }).catch(() => {}); 
      }
      return false;
    }

    if (message.type === 'GET_TAB_ID') {
      const tabId = sender.tab?.id;
      sendResponse({ tabId });
      return false;
    }
  });

  // Clean up when tab is closed
  browser.tabs.onRemoved.addListener((tabId) => {
    browser.storage.local.remove(getTabKey(tabId)).catch(() => {});
  });
});
