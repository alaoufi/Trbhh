'use client';
import {createContext,useContext} from 'react';
import {defaultInterfaceTexts,type InterfaceTexts,type InterfaceTextKey} from '@/lib/interface-texts';
const TextContext=createContext<InterfaceTexts>(defaultInterfaceTexts);
export function InterfaceTextsProvider({texts,children}:{texts:InterfaceTexts;children?:React.ReactNode}){return <TextContext.Provider value={texts}>{children}</TextContext.Provider>;}
export function useInterfaceTexts(){return useContext(TextContext);}
export function InterfaceText({name}:{name:InterfaceTextKey}){return useInterfaceTexts()[name];}
export function ConfiguredPriceLabel({label}:{label:string}){
 const texts=useInterfaceTexts();
 for(const key of ['bidding','negotiable','noPrice','noBudget'] as const)if(label===defaultInterfaceTexts[key])return texts[key];
 return label;
}
