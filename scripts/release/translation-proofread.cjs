// Candidate instruction only. Never rewrites generated answers or public product data.
module.exports=protocol=>({...protocol,translationTask:target=>protocol.translationTask(target)+' Proofread spelling and grammar silently before returning.'});
