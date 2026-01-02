export const city_abbr = {
    "bandung": "BDG",
    "bogor": "BGR",
    "banjarmasin": "BJM",
    "batam": "BTM",
    "cirebon": "CRB",
    "depok": "DPK",
    "jakarta1": "JKT1",
    "jakarta2": "JKT2",
    "jambi": "JMB",
    "kupang": "KPG",
    "lampung": "LPG",
    "medan": "MDN",
    "manado": "MDO",
    "makassar": "MKS",
    "malang": "MLG",
    "padang": "PDG",
    "pekanbaru": "PKB",
    "palembang": "PLB",
    "palu": "PLU",
    "pontianak": "PTK",
    "surabaya": "SBY",
    "solo": "SLO",
    "city": "SMD",
    "semarang": "SMG",
    "denpasar": "DPS",
    "tangerang": "TNG",
    "yogyakarta": "YGA",
}

export const outlet_type = {
    '01': 'APT',
    '02': 'PBF',
    '03': 'RSS',
    '04': 'KLINIK',
    '05': 'LAIN2',
    '09': 'RSS',
    '3B': 'PKM',
    '88': 'ECAT',
}


const os = window.require('os');
const path = window.require('path')
export const HOME_DIR = path.join(os.homedir(), 'Documents', 'MDP Sales');
