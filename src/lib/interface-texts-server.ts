import 'server-only';
import {cache} from 'react';
import {getSetting} from './settings';
import {INTERFACE_TEXT_SETTING,parseInterfaceTexts} from './interface-texts';
export const getInterfaceTexts=cache(async()=>parseInterfaceTexts(await getSetting(INTERFACE_TEXT_SETTING,'{}').catch(()=>'{}')));
