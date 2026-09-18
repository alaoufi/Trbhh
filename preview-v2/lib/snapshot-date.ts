export function snapshotDateLabel(capturedAt:string):string {
 return new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{
  dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Riyadh',
 }).format(new Date(capturedAt));
}
