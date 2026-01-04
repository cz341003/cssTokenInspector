# CSS 变量继承溯源技术方案

## 1. 需求分析与可行性评估

### 1.1 需求背景
目前插件仅能检测当前元素自身是否显式使用了 CSS 变量。对于 `color`、`font-size` 等可继承属性，如果样式是在祖先元素上通过变量定义的，当前元素仅能获取到计算后的绝对值（如 `#000000`），丢失了 `var(--theme-color)` 这样的语义信息。

### 1.2 实时检测可行性分析 (mousemove)
**结论：不可行，存在严重性能隐患。**

*   **计算复杂度高**：
    *   `mousemove` 事件触发频率极高（每秒可达 60 次）。
    *   对于每一个元素，需要检测多个可继承属性（Color, Font, Line-height 等）。
    *   对于每一个属性，需要向上遍历 DOM 树（深度可能为 N）。
    *   最关键的是，判断一个祖先元素是否“定义了该属性且使用了变量”，需要遍历匹配该元素的所有 CSS 规则（包括外部样式表）。`window.getMatchedCSSRules` 已废弃，手动遍历 `document.styleSheets` 极其耗时。
*   **用户体验影响**：
    *   会导致鼠标移动时页面明显的卡顿（掉帧），严重影响插件的“低侵入性”原则。

### 1.3 替代方案：按需检测 (On-Demand Check)
**结论：可行，推荐采用。**

*   **交互设计**：
    *   在悬浮窗的可继承属性值旁边添加一个操作按钮（如“🔍”或“溯源”图标）。
    *   用户对某个具体数值存疑时，手动点击该按钮。
*   **性能影响**：
    *   计算仅在点击时触发一次，耗时 100ms-300ms 都在用户可接受范围内，不会阻塞主线程渲染。

---

## 2. 技术实施方案

### 2.1 核心算法：逆向溯源与规则匹配

为了避免盲目扫描所有祖先的所有 CSS 规则，我们采用 **"值突变定位法" (Value Mutation Location)** 来快速锁定定义样式的祖先。

#### 算法流程
假设我们要寻找 `targetElement` 的 `color` 属性来源：

1.  **获取基准值**：
    *   `currentValue = getComputedStyle(targetElement).color`。
2.  **向上回溯 (DOM Traversal)**：
    *   遍历父节点 `parent`。
    *   获取 `parentValue = getComputedStyle(parent).color`。
    *   **判断逻辑**：
        *   如果 `parentValue !== currentValue`：说明属性值在 `targetElement` 发生改变（或被重置），**继承链中断**。此时 `targetElement` 就是定义该样式的源头（或者使用了默认值）。
        *   如果 `parentValue === currentValue`：说明可能是继承自 `parent`，继续向上查找。
        *   *特殊情况*：如果回溯到 `<html>` 根节点仍未变，说明可能定义在 `:root` 或继承自浏览器默认样式。
3.  **锁定目标节点 (Target Locking)**：
    *   找到最上层的、属性值仍等于 `currentValue` 的节点（或者值发生突变的那个子节点，取决于具体的 CSS 优先级逻辑）。
    *   更精确的做法是：**找到第一个显式定义了该属性的祖先**。
    *   *修正策略*：由于 `ComputedStyle` 是最终值，难以直接区分"继承"还是"显式设置了相同值"。
    *   *实用策略*：从当前元素开始，逐级向上检查：
        1.  检查 **Inline Style** (`el.style.color`) 是否包含 `var(--`)。
        2.  检查 **Matched CSS Rules** 是否包含 `var(--`)。
        3.  如果在某一层找到了变量定义，则停止并返回。

#### 优化后的按需查找算法 (伪代码)

```typescript
function findInheritedVariable(startEl: HTMLElement, prop: string): string | null {
  let el = startEl;
  
  // 设置最大回溯深度，防止死循环或性能过差
  const MAX_DEPTH = 20; 
  let depth = 0;

  while (el && el.parentElement && depth < MAX_DEPTH) {
    // 1. 检查内联样式 (最快)
    const inlineVal = el.style.getPropertyValue(prop);
    if (inlineVal && inlineVal.includes('var(')) {
       return extractVarName(inlineVal);
    }

    // 2. 检查 CSS 规则 (耗时，需按需执行)
    // 注意：这里需要一个辅助函数来遍历 document.styleSheets 并匹配 el
    const cssRuleVal = getStyleFromReview(el, prop);
    if (cssRuleVal && cssRuleVal.includes('var(')) {
       return extractVarName(cssRuleVal);
    }
    
    // 3. 继承阻断检查 (可选优化)
    // 如果 computedStyle 变了，且上面没找到变量，说明可能不是继承的变量，或者是绝对值继承
    // 但为了准确性，通常建议持续向上查，直到找到变量或根节点
    
    el = el.parentElement;
    depth++;
  }
  return null;
}
```

### 2.2 样式表解析难题与解决方案

由于浏览器安全限制（CORS），访问跨域的 `styleSheet.cssRules` 可能会报错。

*   **解决方案**：
    *   使用 `try-catch` 包裹 `cssRules` 访问。
    *   仅匹配当前页面的同源样式和 `<style>` 标签。
    *   辅助函数 `getStyleFromReview` 实现逻辑：
        1.  遍历 `document.styleSheets`。
        2.  遍历 `sheet.cssRules`。
        3.  使用 `el.matches(rule.selectorText)` 判断规则是否命中当前元素。
        4.  检查 `rule.style.getPropertyValue(prop)` 是否包含 `var(`。

### 2.3 UI 改造设计 (`InspectorOverlay.vue`)

1.  **数据结构扩展**：
    ```typescript
    interface StyleItem {
      property: string;
      value: string;
      variable?: string;
      // 新增字段
      isInheritable: boolean; // 是否是可继承属性
      inheritedVar?: string;  // 异步检测到的继承变量
      isChecking?: boolean;   // Loading 状态
    }
    ```

2.  **交互流程**：
    *   `v-for` 渲染列表时，判断 `item.isInheritable && !item.variable`。
    *   如果满足，显示一个小的 icon 按钮（例如 `🔍`）。
    *   点击按钮：
        *   设置 `item.isChecking = true`。
        *   调用溯源函数（异步）。
        *   若找到：更新 `item.inheritedVar`，UI 显示 `Value (Inherited var(--x))`.
        *   若未找到：提示“无变量源”。
        *   设置 `item.isChecking = false`。

3.  **视觉样式**：
    *   按钮应设计得极小且不显眼，仅在鼠标 hover 到该行时显示（减少视觉噪音）。
    *   加载状态可用一个小旋转圆圈表示。

## 3. 开发计划

1.  **Phase 1: 工具函数封装**
    *   实现 `getMatchedCSSVars(element, property)` 函数，负责处理复杂的样式表遍历匹配。
2.  **Phase 2: 组件状态改造**
    *   修改 `InspectorOverlay.vue`，增加对可继承属性的识别（建立白名单：`color`, `font-*`, `line-height`, `text-align`, `visibility` 等）。
3.  **Phase 3: UI 实现**
    *   增加溯源按钮和结果展示区域。

## 4. 总结

该方案在保证页面性能（不阻塞主线程渲染）的前提下，完美解决了“祖先变量溯源”的高级需求。通过“用户主动触发”将计算成本分摊到特定操作上，是目前浏览器插件开发中的最佳实践。
