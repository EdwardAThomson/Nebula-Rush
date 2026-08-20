import { PILOTS } from './PilotDefinitions';

// AI rival name pool. Curated by hand — deliberately OUTSIDE the LLM-favorite
// name distribution (no Vance/Kael/Thorne/Nova-Starling material): mid-century
// British/Irish stock with Polish, Dutch and Scottish mixed in, plus a few
// android designations named like industrial machinery (Echo-7 established
// that androids race). Overpopulated (55) and sampled without replacement per
// roster, so grids vary between sessions and duplicates are impossible.
export const RIVAL_NAME_POOL: string[] = [
    'Alf Duckworth', 'Bert Slattery', 'Cliff Ogden', 'Merle Trask', 'Earl Tibbs',
    'Vern Boggs', 'Stan Kubiak', 'Keith Hanratty', 'Gordon Ackroyd', 'Trevor Speight',
    'Ray Grubb', 'Colin Sowerby', 'Barry Meggitt', 'Wally Crabtree', 'Dai Trevithick',
    'Hamish McTeague', 'Clive Bunn', 'Janusz Sikora', 'Tadhg Brophy', 'Sid Varney',
    'Bram Hoekstra', 'Denny Squires', 'Ron Pickering', 'Reg Hattersley', 'Norm Ferriby',
    'Gerald Mudge', 'Doug Entwistle', 'Frank Ledger',
    'Doreen Askew', 'Sheila Cobb', 'Pam Grimble', 'Nessa Boyle', 'Rita Kowalczyk',
    'Berta Krug', 'Mavis Pilcher', 'Enid Trumble', 'Joan Speck', 'Carol Hutber',
    'Deb Ostrowski', 'Lil Farthing', 'Marge Bickerstaff', 'Fran Tully', 'Norah Quirke',
    'Petula Sykes', 'Hattie Meeks', 'Yvonne Crick', 'Bev Sopwith', 'Gwen Hobbs',
    'Maureen Cuthbert', 'Elsie Braithwaite',
    // Androids — manufactured units, named like the machines they are
    'Bessemer-6', 'Lathe-9', 'Dynamo-5', 'Piston-4', 'Anvil-2',
];

// Draw `count` distinct names (Fisher-Yates shuffle, take the front).
export function drawRivalNames(count: number): string[] {
    const pool = [...RIVAL_NAME_POOL];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // Backstop for count > pool (shouldn't happen at 19-per-race): recycle with
    // a numeral suffix rather than crash or duplicate.
    if (count > pool.length) {
        const extra = Array.from({ length: count - pool.length }, (_, i) => `${pool[i % pool.length]} II`);
        return [...pool, ...extra];
    }
    return pool.slice(0, count);
}

// Dev-time safety: the rival pool must never collide with a playable pilot.
const playable = new Set(PILOTS.map(p => p.name));
const clashes = RIVAL_NAME_POOL.filter(n => playable.has(n));
if (clashes.length > 0) {
    console.warn('[rivalNames] pool collides with playable pilots:', clashes);
}
