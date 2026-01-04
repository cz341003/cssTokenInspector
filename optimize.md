# CSS Token Detector 开发提示词

## 角色设定
你是一名资深前端开发工程师，擅长 Chrome Extension (Manifest V3) 开发和 DOM 性能优化。

## 任务目标
对已有的项目进行优化，包括解决项目问题、实现新需求、优化性能。

## 优化需求
1. **css属性列表显示**: 只检测特定的css属性，限定在以下css属性中：font-size、font-weight、color、line-height、margin、padding、border、border-radius、background、background-color、box-shadow，其中margin、padding、border-radius可能用户只设置了上下左右中的一个或多个，也要展示以下，展示的样式你来定，要求美观；
2. **未使用css变量的属性优化**：检测到的结果中，未使用css变量的css属性，旁边增加一个图标，用来查看其是否是继承的属性，支持查看其祖先元素是否使用了css变量，查看的结果只在点击了图标时才展示，避免性能问题；如果你有更好的方案，也可以按照你的方案修改；
3. **列表样式优化**：用户关注的是是否使用了css变量，所以，列表右侧变量放在上面，变量对应的css实际值放在下面，顺序调整下；

## 输出要求
请基于当前项目对代码进行优化，不能影响原有功能。


