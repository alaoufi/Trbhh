export type CategoryEditorSaveState={error?:{message:string;fieldKey:string;fieldLabel:string}};

/** Only typed validation messages are passed here, never database errors or raw FormData. */
export function categoryEditorError(message:string,fieldKey:string,fieldsJson:FormDataEntryValue|null):CategoryEditorSaveState{
  let fieldLabel='';
  if(fieldKey&&typeof fieldsJson==='string'&&fieldsJson.length<=100000){
    try{
      const fields:unknown=JSON.parse(fieldsJson);
      if(Array.isArray(fields)){
        const field=fields.find(f=>f&&typeof f==='object'&&f.key===fieldKey);
        if(typeof field?.label==='string')fieldLabel=field.label.trim().slice(0,120);
      }
    }catch{/* Invalid JSON has its own validation message. */}
  }
  return {error:{message,fieldKey,fieldLabel}};
}
