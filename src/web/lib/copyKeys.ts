// useCopy 的“已复制”键。集中在这里，App 判断时不必静态导入懒加载的组件模块。
export const addressKey = 'address';
export const slipCodeKey = (id: number) => `code-${id}`;
export const detailCodeKey = (id: number) => `detail-code-${id}`;
