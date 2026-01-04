<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';

interface StyleItem {
  property: string;
  value: string;
  variable?: string;
  // Inheritance tracing fields
  isInheritable?: boolean;
  inheritedVar?: string;
  isChecking?: boolean;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ElementData {
  tagName: string;
  className: string;
  styles: StyleItem[];
  mouseX: number;
  mouseY: number;
  rect: Rect;
}

const propNameMap: Record<string, string> = {
  'font-size': '字体大小',
  'font-weight': '字体粗细',
  'color': '字体颜色',
  'line-height': '行高',
  'margin': '外边距',
  'padding': '内边距',
  'border': '边框',
  'border-radius': '圆角',
  'background': '背景',
  'background-color': '背景颜色',
  'box-shadow': '阴影',
  'margin-top': '上外边距',
  'margin-right': '右外边距',
  'margin-bottom': '下外边距',
  'margin-left': '左外边距',
  'padding-top': '上内边距',
  'padding-right': '右内边距',
  'padding-bottom': '下内边距',
  'padding-left': '左内边距',
  'border-top': '上边框',
  'border-right': '右边框',
  'border-bottom': '下边框',
  'border-left': '左边框',
  'border-top-left-radius': '左上圆角',
  'border-top-right-radius': '右上圆角',
  'border-bottom-right-radius': '右下圆角',
  'border-bottom-left-radius': '左下圆角',
};

const inheritableProps = new Set([
  'color', 
  'font-size', 
  'font-weight', 
  'line-height', 
  'text-align', 
  'visibility', 
  'white-space', 
  'word-spacing',
  'cursor'
]);

const isActive = ref(false);
const isFrozen = ref(false);
const mousePos = ref({ x: 0, y: 0 });
const panelPos = ref({ x: 0, y: 0 });
const styles = ref<StyleItem[]>([]);
const targetElement = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const currentElementData = ref<{ tagName: string, className: string } | null>(null);
const currentTabId = ref<number | null>(null);
const highlightRect = ref<Rect | null>(null);

const isTopFrame = window === window.top;

const panelStyle = computed(() => {
  if (!panelPos.value.x || !panelPos.value.y) return { display: 'none' };
  
  return {
    left: `${panelPos.value.x}px`,
    top: `${panelPos.value.y}px`,
    display: isActive.value ? 'block' : 'none',
    borderColor: isFrozen.value ? '#fbbf24' : '#e2e8f0',
    pointerEvents: (isFrozen.value ? 'auto' : 'none') as any,
    boxShadow: isFrozen.value 
      ? '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(251, 191, 36, 0.3)' 
      : '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  };
});

const maskStyle = computed(() => {
  if (!highlightRect.value || !isActive.value) return { display: 'none' };
  return {
    left: `${highlightRect.value.x}px`,
    top: `${highlightRect.value.y}px`,
    width: `${highlightRect.value.width}px`,
    height: `${highlightRect.value.height}px`,
    display: 'block',
  };
});

// --- Inheritance Tracing Logic ---

const getStyleFromRules = (el: HTMLElement, prop: string): string | undefined => {
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        if (!sheet.cssRules) continue;
        for (const rule of Array.from(sheet.cssRules)) {
          if (rule instanceof CSSStyleRule) {
            // Simple matching: checks if the element matches the selector.
            // Doesn't strictly follow cascade/specificity for this "search", 
            // but effectively finds if the rule *could* apply and has a var.
            if (el.matches(rule.selectorText)) {
              const val = rule.style.getPropertyValue(prop);
              if (val && val.includes('var(')) {
                return val;
              }
            }
          }
        }
      } catch (e) {
        // Ignore CORS errors or access denied
      }
    }
  } catch (e) {}
  return undefined;
};

const findInheritedVariable = (startEl: HTMLElement, prop: string): string | undefined => {
  let el = startEl.parentElement;
  let depth = 0;
  const MAX_DEPTH = 20;

  while (el && depth < MAX_DEPTH) {
    // 1. Check Inline Style
    const inlineVal = el.style.getPropertyValue(prop);
    if (inlineVal && inlineVal.includes('var(')) {
      const match = inlineVal.match(/var\((--[^)]+)\)/);
      if (match) return match[1];
    }

    // 2. Check CSS Rules
    const cssVal = getStyleFromRules(el, prop);
    if (cssVal) {
       const match = cssVal.match(/var\((--[^)]+)\)/);
       if (match) return match[1];
    }
    
    // Move up
    el = el.parentElement;
    depth++;
  }
  return undefined;
};

const checkInheritance = async (item: StyleItem) => {
  if (!targetElement.value) return;
  
  item.isChecking = true;
  
  // Use setTimeout to allow UI update and prevent blocking
  setTimeout(() => {
    const inherited = findInheritedVariable(targetElement.value!, item.property);
    item.inheritedVar = inherited || '未找到变量源';
    item.isChecking = false;
  }, 10);
};

// --- End Inheritance Logic ---

const getVariableForProperty = (el: HTMLElement, prop: string): string | undefined => {
  const inlineValue = el.style.getPropertyValue(prop);
  if (inlineValue.includes('var(')) {
    const match = inlineValue.match(/var\((--[^)]+)\)/);
    if (match) return match[1];
  }

  try {
    // @ts-ignore
    const rules = window.getMatchedCSSRules?.(el);
    if (rules) {
      for (let i = rules.length - 1; i >= 0; i--) {
        const rule = rules[i] as CSSStyleRule;
        const val = rule.style.getPropertyValue(prop);
        if (val.includes('var(')) {
          const match = val.match(/var\((--[^)]+)\)/);
          if (match) return match[1];
        }
      }
    } else {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (rule instanceof CSSStyleRule && el.matches(rule.selectorText)) {
              const val = rule.style.getPropertyValue(prop);
              if (val.includes('var(')) {
                const match = val.match(/var\((--[^)]+)\)/);
                if (match) return match[1];
              }
            }
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
  return undefined;
};

const getStyles = (el: HTMLElement): StyleItem[] => {
  const computedStyle = window.getComputedStyle(el);
  const mainProps = [
    'font-size', 'font-weight', 'color', 'line-height',
    'margin', 'padding', 'border', 'border-radius',
    'background', 'background-color', 'box-shadow'
  ];

  const subPropsMap: Record<string, string[]> = {
    'margin': ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
    'padding': ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
    'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
    'border': ['border-top', 'border-right', 'border-bottom', 'border-left'],
  };

  const newStyles: StyleItem[] = [];
  mainProps.forEach(prop => {
    const value = computedStyle.getPropertyValue(prop);
    const isInheritable = inheritableProps.has(prop);

    if (subPropsMap[prop]) {
      const subValues = subPropsMap[prop].map(p => computedStyle.getPropertyValue(p));
      const allSame = subValues.every(v => v === subValues[0]);
      if (allSame && value && value !== '0px' && !value.includes('0px 0px')) {
        const variable = getVariableForProperty(el, prop);
        newStyles.push({ property: prop, value: value.toLowerCase(), variable, isInheritable });
      } else {
        subPropsMap[prop].forEach(p => {
          const v = computedStyle.getPropertyValue(p);
          if (v && v !== '0px' && v !== '0' && !v.includes('none')) {
            const variable = getVariableForProperty(el, p);
            // sub-properties like margin-top are not typically inherited in the same way 
            // the shorthand might be, but let's assume specific ones aren't for now unless explicit.
            newStyles.push({ property: p, value: v.toLowerCase(), variable, isInheritable: inheritableProps.has(p) });
          }
        });
      }
    } else {
      if (value && value !== 'none' && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
        const variable = getVariableForProperty(el, prop);
        newStyles.push({ property: prop, value: value.toLowerCase(), variable, isInheritable });
      }
    }
  });
  return newStyles;
};

let throttleTimer: number | null = null;
const handleMouseMove = (e: MouseEvent) => {
  if (!isActive.value || isFrozen.value) return;

  const elAtPoint = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
  if (elAtPoint?.closest('#element-style-inspector-root')) return;

  if (isTopFrame) {
    mousePos.value = { x: e.clientX, y: e.clientY };
    updatePanelPosition(e.clientX, e.clientY);
  }

  if (throttleTimer) return;
  throttleTimer = window.setTimeout(() => {
    throttleTimer = null;
    if (!elAtPoint || elAtPoint === targetElement.value) return;

    targetElement.value = elAtPoint;
    
    const rect = elAtPoint.getBoundingClientRect();
    const elementData: ElementData = {
      tagName: elAtPoint.tagName.toLowerCase(),
      className: String(elAtPoint.className),
      styles: getStyles(elAtPoint),
      mouseX: e.clientX,
      mouseY: e.clientY,
      rect: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      }
    };

    if (isTopFrame) {
      currentElementData.value = { tagName: elementData.tagName, className: elementData.className };
      styles.value = elementData.styles;
      highlightRect.value = elementData.rect;
    } else {
      browser.runtime.sendMessage({
        type: 'IFRAME_STYLE_UPDATE',
        data: elementData
      });
    }
  }, 40);
};

const updatePanelPosition = (x: number, y: number) => {
  let nextX = x + 15;
  let nextY = y + 15;
  if (panelRef.value) {
    const rect = panelRef.value.getBoundingClientRect();
    if (nextX + rect.width > window.innerWidth) nextX = x - rect.width - 15;
    if (nextY + rect.height > window.innerHeight) nextY = y - rect.height - 15;
  }
  panelPos.value = { x: nextX, y: nextY };
};

const handleKeyDown = async (e: KeyboardEvent) => {
  if (!isActive.value) return;

  const key = e.key.toLowerCase();
  if (key === 'f') {
    isFrozen.value = !isFrozen.value;
  } else if (e.key === 'Escape') {
    if (currentTabId.value) {
      await browser.storage.local.set({ [`tab_active_${currentTabId.value}`]: false });
    }
  }
};

const syncState = (changes: any) => {
  if (!currentTabId.value) return;
  const key = `tab_active_${currentTabId.value}`;
  if (changes[key]) {
    isActive.value = !!changes[key].newValue;
    if (!isActive.value) {
      isFrozen.value = false;
      targetElement.value = null;
      highlightRect.value = null;
    }
  }
};

onMounted(async () => {
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('keydown', handleKeyDown);
  browser.storage.onChanged.addListener(syncState);
  
  try {
    const res = await browser.runtime.sendMessage({ type: 'GET_TAB_ID' });
    if (res && res.tabId !== undefined) {
      currentTabId.value = res.tabId;
      const key = `tab_active_${res.tabId}`;
      const state = await browser.storage.local.get(key);
      isActive.value = !!state[key];
    }
  } catch (e) {
    console.error('Failed to initialize inspector state:', e);
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message.type === 'FROM_IFRAME_STYLE_UPDATE' && isTopFrame && !isFrozen.value) {
      const { data } = message;
      const iframes = Array.from(document.querySelectorAll('iframe'));
      const targetIframe = iframes.find(iframe => {
        const rect = iframe.getBoundingClientRect();
        return (
          mousePos.value.x >= rect.left &&
          mousePos.value.x <= rect.right &&
          mousePos.value.y >= rect.top &&
          mousePos.value.y <= rect.bottom
        );
      });

      if (targetIframe) {
        const iframeRect = targetIframe.getBoundingClientRect();
        updatePanelPosition(iframeRect.left + data.mouseX, iframeRect.top + data.mouseY);
        currentElementData.value = { tagName: data.tagName, className: data.className };
        styles.value = data.styles;
        highlightRect.value = {
          x: iframeRect.left + data.rect.x,
          y: iframeRect.top + data.rect.y,
          width: data.rect.width,
          height: data.rect.height
        };
      }
    }
  });
});

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('keydown', handleKeyDown);
  browser.storage.onChanged.removeListener(syncState);
});
</script>

<template>
  <div v-if="isActive && isTopFrame" class="inspector-container">
    <!-- Highlight Mask -->
    <div class="element-highlight-mask" :style="maskStyle"></div>

    <!-- Style Panel -->
    <Transition name="fade">
      <div
        v-if="currentElementData"
        ref="panelRef"
        class="style-inspector-panel"
        :style="panelStyle"
      >
        <div class="panel-header">
          <div class="header-top">
            <span class="status-dot" :class="{ 'frozen': isFrozen }"></span>
            <span class="title">{{ isFrozen ? '冻结中' : 'CSS Token检测' }}</span>
          </div>
          <div class="element-info">
            <span class="tag-name">{{ currentElementData.tagName }}</span>
            <span v-if="currentElementData.className" class="class-name" :title="currentElementData.className">
              .{{ currentElementData.className.split(' ').filter(Boolean).join('.') }}
            </span>
          </div>
        </div>
        
        <div class="panel-content">
          <div v-for="(item, index) in styles" :key="item.property" class="style-row" :class="{ 'even': index % 2 === 0 }">
            <div class="prop-name">
              <span>{{ item.property }}</span>
              <span v-if="propNameMap[item.property]" class="cn-label">{{ propNameMap[item.property] }}</span>
            </div>
            <div class="prop-value-group">
              <div v-if="item.variable" class="var-name" :title="item.variable">
                {{ item.variable }}
              </div>
              <div v-else-if="item.inheritedVar" class="var-name inherited-var" :title="item.inheritedVar">
                {{ item.inheritedVar }}
              </div>
              
              <div class="prop-value-row">
                 <div class="prop-value" :class="{ 'is-var': item.variable || item.inheritedVar }">{{ item.value }}</div>
                 <!-- Trace Button -->
                 <button 
                   v-if="item.isInheritable && !item.variable && !item.inheritedVar" 
                   class="trace-btn"
                   @click.stop="checkInheritance(item)"
                   title="查找继承变量"
                 >
                   <span v-if="item.isChecking" class="loading-spinner"></span>
                   <span v-else>🔍</span>
                 </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="less">
.element-highlight-mask {
  position: fixed;
  z-index: 99998;
  background-color: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.5);
  pointer-events: none;
  transition: all 0.1s ease-out;
}

.style-inspector-panel {
  position: fixed;
  z-index: 99999;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(12px);
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  width: 330px;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 12px;
  color: #1e293b;
  user-select: none;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  overflow: hidden;

  .panel-header {
    padding: 12px 16px;
    background-color: #f8fafc;
    border-bottom: 1px solid #f1f5f9;

    .header-top {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #10b981;
        box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.1);

        &.frozen {
          background: #fbbf24;
          box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.1);
        }
      }

      .title {
        font-size: 10px;
        font-weight: 800;
        color: #1e293b;
        letter-spacing: 0.1em;
      }
    }

    .element-info {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px 8px;

      .tag-name {
        color: #2563eb;
        font-weight: 800;
        font-size: 16px;
      }

      .class-name {
        color: #475569;
        font-size: 10px;
        word-break: break-all;
        line-height: 1.5;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        background: #f1f5f9;
        padding: 1px 4px;
        border-radius: 4px;
      }
    }
  }

  .panel-content {
    display: flex;
    flex-direction: column;
    padding: 0;

    .style-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 16px;
      transition: background-color 0.1s ease;
      border-bottom: 1px solid #cbd5e1;

      &:last-child {
        border-bottom: none;
      }

      &:hover {
        background-color: #f8fafc;
      }

      &.even {
        background-color: #f1f5f9;
      }

      .prop-name {
        color: #334155;
        font-size: 10px;
        letter-spacing: 0.05em;
        flex-shrink: 0;
        width: 120px;
        font-weight: 800;
        padding-top: 2px;
        display: flex;
        flex-direction: column;
        gap: 2px;

        .cn-label {
          font-size: 9px;
          color: #64748b;
          font-weight: normal;
          text-transform: none;
          letter-spacing: 0;
        }
      }

      .prop-value-group {
        flex: 1;
        min-width: 0;
        text-align: right;

        .var-name {
          font-size: 10px;
          color: #d97706;
          font-weight: 600;
          margin-bottom: 2px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-family: ui-monospace, monospace;
          
          &.inherited-var {
             color: #059669; /* Green for inherited */
          }
        }
        
        .prop-value-row {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 6px;
        }

        .prop-value {
          font-size: 11px;
          color: #0f172a;
          word-break: break-all;
          font-family: ui-monospace, monospace;
          line-height: 1.4;

          &.is-var {
            font-weight: 600;
          }
        }
        
        .trace-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px;
          font-size: 10px;
          color: #64748b;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.6;
          transition: opacity 0.2s;
          
          &:hover {
             opacity: 1;
             background-color: #e2e8f0;
             border-radius: 4px;
          }
        }
        
        .loading-spinner {
          width: 8px;
          height: 8px;
          border: 1px solid #cbd5e1;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
      }
    }
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.95);
}
</style>