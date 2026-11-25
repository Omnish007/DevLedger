import { CORE_MIGRATIONS } from './migrations-core.ts';
import { RELATION_MIGRATIONS } from './migrations-relations.ts';
import { SEARCH_MIGRATIONS } from './migrations-search.ts';
import { SECURITY_MIGRATIONS } from './migrations-security.ts';

export const CURRENT_SCHEMA_VERSION = 19;
export const MIGRATIONS = [
    ...CORE_MIGRATIONS,
    ...RELATION_MIGRATIONS,
    ...SEARCH_MIGRATIONS,
    ...SECURITY_MIGRATIONS,
];
