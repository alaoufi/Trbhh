export type CatalogCategoryOption={id:string;label:string;levels?:{key:string;label:string}[]};
export type CatalogCategoryNode={key:string;label:string;categoryId?:string;children:CatalogCategoryNode[]};
export function cjCategoryTree(options:CatalogCategoryOption[]):CatalogCategoryNode[]{
 const roots:CatalogCategoryNode[]=[],seen=new Set<string>();
 for(const option of options){if(!option.id||seen.has(option.id))continue;seen.add(option.id);const levels=option.levels?.length?option.levels:[{key:option.id,label:option.label}];let nodes=roots,prefix='';
  levels.forEach((level,index)=>{const leaf=index===levels.length-1;prefix+=JSON.stringify(level.key);const key=leaf?'leaf:'+option.id:'branch:'+prefix;let node=nodes.find(n=>n.key===key);if(!node){node={key,label:level.label,...(leaf?{categoryId:option.id}:{}),children:[]};nodes.push(node);}nodes=node.children;});
 }
 return roots;
}
export function findCategoryPath(nodes:CatalogCategoryNode[],id:string):string[]{for(const node of nodes){if(node.categoryId===id)return [node.key];const child=findCategoryPath(node.children,id);if(child.length)return [node.key,...child];}return [];}
