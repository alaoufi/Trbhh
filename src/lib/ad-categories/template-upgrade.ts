import { createHash } from 'node:crypto';
import type { CategoryKind } from './contracts';
import type { CategoryField } from './validation';
import { CATEGORY_SEED_TEMPLATES } from './seed-templates';
import type {ListingPolicy} from './listing-policy';

export const CATEGORY_LATEST_TEMPLATES_SETTING = 'categories_v2_latest_templates';

type ResolvableDefinition = {
  version: number;
  kind: CategoryKind;
  priceEnabled: boolean;
  goodsEnabled: boolean;
  fields: CategoryField[];
  listingPolicy?: ListingPolicy;
  fieldsFingerprint?: string;
};

// بصمات قوالب النظام الأولى المنشورة في 19 سبتمبر 2026. لا تُستخدم لترقية
// تعريف إداري معدل، بل فقط لإثبات أن النسخة 1 ما زالت القالب النظامي القديم نفسه.
const LEGACY_V1_FIELD_FINGERPRINTS: Record<string, string> = {
  land: '5cf4148a9517012e201e997297ca5145bbb9b55005d04cb113e46ff4c40fce59',
  villa: 'c37521f124245a27277926d08f2a0798170d5c1431d7e810e9ba5f4d19dfe5c1',
  apartment: 'd3d351fa83d0af3961fffb3d892e440e6a9f047b1b76916931982207a79bc208',
  commercial_property: '6ded7300bbe1681fa3dec5bbb7e12dd9e0bce2cd8436010e692e2a0576b4b22e',
  car: 'b5d9c1d20375aacb681e2a1d9284d564c29ae17ff0abeb7671628c0ca44a38a0',
  car_parts: 'b3ebb60d989f8b10e0b26b67d658e439122d08fd5592d3891e8447b77b983aaf',
  job: 'f689ab0554c6b27e4c17e0dd30ca0f0630568d411998e05bfecd7f43343a880c',
  plants: 'b30953b91c965dfe44c3b806fa17c2f5ea9d490017a6d379ff13b455fcdf3085',
  feed: '4393a0aed29a7ac19cb5f4cce27a08255844c8c60b06358a20b63e487514ce38',
  irrigation: 'd5747102cf62951721125235c18af2352c3872f16060f23add59313ccd937a58',
  garden_service: 'c0b6f0c2212b6ad222b4c872a4d0f611738519248fbf832872978b5c63207f65',
  sheep_goats: 'c7a4e297e09fcbb9264b99feffa05c5bbcbd76d3daafe812548728d87154a0f4',
  camels_cattle: 'e98ee5cb29d0e7b645e6b7d2d7dbaee3ef4560a203794a09423ff7823a580821',
  poultry: '9bdaa257d11fc9906298382b1e57ffc0e18af3e2a56107acdf3093c57625ab27',
  livestock_equipment: '1b342d627bbcbaed53aaa3e2b1b53c332a6f3b1d0b13d8c427253ddc922467d7',
  cookware: '9b3b1ac483bc7c6c7421a99782e8672642421c6d2677ca2a194128e3174e178a',
  tableware: 'c6350ddcdc6d549be940590400a5869f385e7a3954367defdf42522ce6b333da',
  storage: '3a681e3a36377b562243ee50dbb0f1fe663cff2f2142c75ee8377de02ed714a7',
  rugs: 'ec5ac76afa6b131accf0e7ac8266d8c9b5643472a744fe7021bcd0cadaab1f1c',
  curtains: '11be1cf5c3347c7e5102dc93b8cb960254abfe3fc6a35310cdb001b1aed22566',
  wall_decor: '4f9b7fda119a483018a1fc7a40b73304fb3fd53b4d9e1f3b8697693f910c456e',
  decor_service: '3818bcf643d1b2a8748b9e5078032a10a01fe687a5c757178e3119963a8e6065',
  tiles: 'af27d523b40c7ee3e13a82ff570f43cf74e949b805851e1ab90533595237e399',
  building_materials: '20cd3407709f63cd565d9e44151dbef4ac82832e579e59aeb3808eeef31f7a3b',
  sanitary: '944c8d4c774858d5e84b9d82fef0b9044ff61af8cd82cc18045435b30d973538',
  contracting: 'f212ea37069ab54f5059b138493158096bd386fb087bc8a71c4b017e72571827',
  earthmoving: '6358a8c17c0b587801baaa41735d8393e8cf69a65161c1ed506a9e3757882bad',
  lifting: 'eede28874ced4fc6ed1fbba847f842419db2f70c914f13508cc89602bb279917',
  commercial_vehicles: '265d08cbbfb09744acf66c791bd106ddc61780a78c1b45cb70ae9532bb0afe6f',
  transport_service: '056707ec061ed2aa18dfd97dc6c30e209fa2818ad8199eab9fabb19ea1a75ec1',
};

// قوالب فرع المعاينة قبل إدخال سياسة أنواع الإعلان. اعتماد البصمة يمنع لمس أي
// تعريف عدلته الإدارة، لكنه يسمح للنسخة النظامية المنشورة بالحصول على السياسة الجديدة.
const PRE_POLICY_FIELD_FINGERPRINTS:Record<string,string>={
  land:'2743b960a5200645e21d624392dded88a30f96be89e5f70c3354cf0f68743bc3',villa:'74f573b9fee4a88a2c2f02572363100159e1d82b1991fab696ffacd250663cc5',apartment:'d17ebb24efff434dcbfb719f850de8a00effa82b0a30d14edbdcc30fefef0068',commercial_property:'ff2526111a88ae4ba4d2a1594f3de99f794339239742f25e429a0174fdb576ca',
  car:'c76c888cd7ac42bedd851008361e310c99daead800099c7130bd7d3216dbf6c2',car_parts:'6c019863b0516aa454c9a5256bb606f6ad8a6f4816511b06beae5ab7f8c40d7e',job:'2517627cad6118b090420620a8251ea5670fce26d0e9cb4299a2492bbec1f048',plants:'e42b4c5be6c3ca9c6beceb98a77edcb1965ad9eb58cd362ab6adb668279bfa4f',feed:'faa9c0e2b92b7f8a3082b8ec5344bab7dc005bc57eaf13fb6834544f3f024168',irrigation:'ff44eb8528ce7d9fb6b0c80c64757aca5ac17a6d04a7407381a4683faff85ff5',garden_service:'e1f92a85dbd04e2ed3614df060fc4ba9edd600afc2059981a2bd0619b1214fc4',
  sheep_goats:'e55896099f5c32e8ba5203d0db4f431d5cd5b6165e7389a8ac93083726228a8c',camels_cattle:'569e6b6e2cc3260df07d85ddeb3b3e7752763d929281d07f8386d12f0dc619b6',poultry:'82f741a164e8b7d727e655b3b93776861cbfbdcc0aaaa0da9c39c3d7d56fc47d',livestock_equipment:'a6a6bb601fc02249fa20f12841ac8c229323af0dbf8185170abcfffed112992f',cookware:'2832a16ae41a79d6faa619e2481543f9701c04d39f15ea012c5f1ac9b703cd07',tableware:'83b7fda7a77540b56835feadf91730689112d121f37335db4fa957e7495dd1ae',storage:'289000a1e16933fdee752e5880a72a06132d06b940e86018a80e93f22d312df1',
  rugs:'113fb07cc356af4c61632f31e253beb87c4b620c47335bad663da886feedbda9',curtains:'83b88ef18fe74dd0ecce233025e1e9cbe416aaca01b36465e5ef9c7ec2ce1944',wall_decor:'55fe060b4e94147f9eb905f39481d5c281b51572a0cd6318e0456c873fbd00bb',decor_service:'5b3836805837a2b2356935660724cbfb440a814a8d08c262927ac5711c76fc57',tiles:'e5b9a80d61a6c17a40425138e2e4584351f1d56ba00df2c913528fb2aefa2ccf',building_materials:'63fe02ecab84b487de803593a2ad39f917f935050d4bf888956d9d7321537230',sanitary:'402b9f68bc82616981bf077b9f6206143e0cd29b2ad131f29d1d87f58c13d4ed',contracting:'370a4d47859183729837faeeccc49c2176c67dcef0f14b125e4bbe9c102b7f50',
  earthmoving:'9e0a13cd90f35063a2c407c11c56c30059d617190677a1c082a80cc735323e41',lifting:'9d5f62072037611f0423d812094f7a6a38771741f229fac823ce057846a84bf6',commercial_vehicles:'d3d36e4bf9fc19f7155e7e959f1da53e2ef4b6c04053a95d4e72f2dd4d635e2a',transport_service:'5accaaf8999cd974db086ad9a5bc175802e161a18a6bdaec1124007a79284f70',
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function categoryFieldsFingerprint(rawFields: unknown): string {
  return createHash('sha256').update(stableJson(rawFields)).digest('hex');
}

function knownSystemFingerprints(template: (typeof CATEGORY_SEED_TEMPLATES)[number]): string[] {
  const fingerprints = [LEGACY_V1_FIELD_FINGERPRINTS[template.key], PRE_POLICY_FIELD_FINGERPRINTS[template.key]].filter((value): value is string => Boolean(value));
  if (template.key === 'rugs') {
    const previousFields = template.fields.map(field => field.key === 'material' ? { ...field, type: 'multiselect' as const } : field);
    fingerprints.push(categoryFieldsFingerprint(previousFields));
  }
  return fingerprints;
}

export function resolveCategoryDefinition(
  definition: ResolvableDefinition,
  categoryName: string,
  subcategoryName: string,
  useLatestTemplates: boolean,
) {
  const template = CATEGORY_SEED_TEMPLATES.find(item => item.categoryName === categoryName && item.name === subcategoryName);
  const untouchedBuiltInV1 = useLatestTemplates && definition.version === 1 && template
    && knownSystemFingerprints(template).includes(definition.fieldsFingerprint||'');
  const { fieldsFingerprint: _fingerprint, ...visibleDefinition } = definition;
  if (!untouchedBuiltInV1 || !template) return { ...visibleDefinition, upgradedFromBuiltInV1: false };
  return {
    ...visibleDefinition,
    kind: template.kind,
    priceEnabled: template.priceEnabled,
    goodsEnabled: template.goodsEnabled,
    fields: template.fields.map(field => ({ ...field, options: [...field.options] })),
    listingPolicy: template.listingPolicy,
    upgradedFromBuiltInV1: true,
  };
}
