import {config} from '@remotion/eslint-config-flat';
export default [...config,
 {files:['app/**/*.{ts,tsx}','shared/**/*.ts','server/**/*.{ts,mjs}'],rules:{'@remotion/warn-native-media-tag':'off','@remotion/non-pure-animation':'off','@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}],'no-control-regex':'off'}},
 {files:['server/**/*.mjs'],languageOptions:{globals:{process:'readonly',Buffer:'readonly',console:'readonly'}}}
];
