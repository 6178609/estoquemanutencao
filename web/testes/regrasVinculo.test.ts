import { describe, expect, it } from "vitest";

import { comPecasDaRegra, vinculosDasRegras } from "@/lib/dados/regrasVinculo";

/** Só dados fictícios. */
const eq = (equipamento: string, denominacao: string, inativo = false) => ({ equipamento, denominacao, inativo, desativado: inativo });
const mat = (material: string, descr: string, status = "APROVADO") => ({ material, descricaoCurta: descr, descrCompleta: "", status });

describe("regra: injetoras KCLKA da EXP 12 em diante recebem os materiais EK3", () => {
  const equips = [eq("1", "INJETORA EXP 11 (10 EST) UGB2 KING STEEL"), eq("2", "INJETORA EXP 12 (6 EST) UGB2 KCLKA"),
    eq("3", "INJETORA EXP 30 (10 EST) UGB2 KCLKA"), eq("4", "INJETORA EXP 21 (10 EST) UGB2 KCLKA", true),
    eq("5", "INJ EXP 15 UGB2 KCLKA - SIST EST 01"), eq("6", "INJETORA EXP 09 (10 EST) UGB2 KCLKA")];
  const cat = [mat("100", "AGULHA EK3-6E2 KCLKA"), mat("101", "BICO; MODELO: EK3-10E2"), mat("102", "BICO EK3", "BLOQUEADO"),
    mat("103", "BICO EK30 OUTRO"), mat(" ", "SEM CODIGO EK3")];
  const v = vinculosDasRegras(equips, cat);

  it("só as injetoras principais KCLKA ativas com número 12 ou mais", () => {
    expect([...v.keys()]).toEqual(["2", "3"]);
  });
  it("só os materiais EK3 aprovados e com código", () => {
    expect(v.get("2")).toEqual({ nome: "INJETORA EXP 12 (6 EST) UGB2 KCLKA", materiais: ["100", "101"] });
  });
  it("só acrescenta o que falta e cria o cadastro mínimo", () => {
    expect(comPecasDaRegra({ nome: "X", materiais: ["100", "999"] }, "X", ["100", "101"])).toEqual({ nome: "X", materiais: ["100", "101", "999"] });
    expect(comPecasDaRegra({ nome: "X", materiais: ["100", "101"] }, "X", ["100", "101"])).toBeNull();
    expect(comPecasDaRegra(undefined, "INJ", ["100"])).toMatchObject({ nome: "INJ", materiais: ["100"], situacao: "Em operação" });
  });
});

describe("regra: injetoras Golden Eagle 01 a 12 recebem os materiais do modelo 180S", () => {
  const m = (material: string, modelo: string, status = "APROVADO") => ({ material, descricaoCurta: "PECA", descrCompleta: `PECA; MODELO: ${modelo}; FAB: GOLDEN EAGLE - REF: 1`, status });
  const equips = [eq("1", "INJETORA 01 UGB1 GOLDEN EAGLE"), eq("2", "INJETORA 12 UGB1 GOLDEN EAGLE"), eq("3", "INJETORA 13 UGB1 GOLDEN EAGLE"),
    eq("4", "INJETORA 08 UGB1 GOLDEN EAGLE", true), eq("5", "INJETORA PVC (GOLDEN EAGLE) 006"), eq("6", "INJ PVC 02 GOLDEN - SISTEMA DE INJECAO")];
  const cat = [m("10", "GEL 180/S"), m("11", "GEL180S"), m("12", "GEK 180/S"), m("13", "GEL/GEK/180/S"), m("14", "GEL 180"), m("15", "GEL/180L"),
    m("16", "GEK 180/700/S"), m("17", "GEL 180/S", "BLOQUEADO"), m("18", "GOLDEN EAGLE 180S")];
  const v = vinculosDasRegras(equips, cat);
  it("só as injetoras 01 a 12 UGB1 ativas", () => expect([...v.keys()]).toEqual(["1", "2"]));
  it("só a família 180S aprovada", () => expect(v.get("1")!.materiais).toEqual(["10", "11", "12", "13", "18"]));
});

describe("regra: injetoras PVC (Golden Eagle) recebem os materiais GEK 220 / GEKK", () => {
  const m = (material: string, modelo: string, status = "APROVADO", curta = "PECA") => ({ material, descricaoCurta: curta, descrCompleta: `PECA; MODELO: ${modelo}; FAB: GOLDEN EAGLE`, status });
  const equips = [eq("1", "INJETORA PVC (GOLDEN EAGLE) 006"), eq("2", "INJETORA PVC (GOLDEN EAGLE) 021"), eq("3", "INJETORA PVC (GOLDEN EAGLE) 05 - INATIVO", true),
    eq("4", "INJ PVC 02 GOLDEN - SISTEMA DE INJECAO"), eq("5", "INJETORA 01 UGB1 GOLDEN EAGLE")];
  const cat = [m("20", "GEK 220W/S"), m("21", "GEK220"), m("22", "GEK 220/S"), m("23", "GEK 2200"), m("24", "GEK 180/S"), m("25", "X", "APROVADO", "BICO GEKK"),
    m("26", "GEK 220W/S", "BLOQUEADO")];
  const v = vinculosDasRegras(equips, cat);
  it("só as injetoras PVC ativas", () => expect([...v.keys()].sort()).toEqual(["1", "2", "5"]));
  it("só GEK 220 / GEKK aprovados", () => expect(v.get("1")!.materiais).toEqual(["20", "21", "22", "25"]));
  it("a Golden 01 UGB1 continua só com o 180S", () => expect(v.get("5")!.materiais).toEqual(["24"]));
});

describe("regras: Tien Kang e Pan Stone (JOB)", () => {
  const m = (material: string, curta: string, completa = "", status = "APROVADO") => ({ material, descricaoCurta: curta, descrCompleta: completa, status });
  const equips = [eq("1", "INJETORA TIEN KANG 06 - 2 ESTACOES"), eq("2", "INJETORA TIEN KANG 06 - ESTACAO A"), eq("3", "PRENSA DE SOLA TIENKANG N° 01", true),
    eq("4", "PAN STONE 05 - JOB-AN34/2"), eq("5", "PRENSA PANSTONE 01 - JOB-AD82"), eq("6", "CARRO TROCA DE MOLDE PAN STONE"), eq("7", "INJETORA PAN STONE 01", true),
    eq("8", "PAN STONE 05 - SISTEMA DE CONTROLE")];
  const cat = [m("30", "ANEL BLOQUEIO TIEN KANG C2405473"), m("31", "AGULHA", "FAB: TIENKANG - REF: 1"), m("32", "BICO TIEN KANG", "", "BLOQUEADO"),
    m("40", "ROSCA PAN STONE WX0-211", "SERIE: JOB-AQ/82"), m("41", "KIT CIL PAN STONE RS-950-JOB-AD82"), m("42", "PORTA MOLDE HAV", "MODELO: PAN STONE")];
  const v = vinculosDasRegras(equips, cat);
  it("só as máquinas principais ativas", () => expect([...v.keys()].sort()).toEqual(["1", "4", "5"]));
  it("Tien Kang com TIEN KANG/TIENKANG aprovados", () => expect(v.get("1")!.materiais).toEqual(["30", "31"]));
  it("Pan Stone só com PAN STONE e JOB", () => expect(v.get("4")!.materiais).toEqual(["40", "41"]));
});

describe("regra: Banbury Bonfanti BMI-80", () => {
  const m = (material: string, curta: string, completa = "", status = "APROVADO") => ({ material, descricaoCurta: curta, descrCompleta: completa, status });
  const equips = [eq("1", "BANBURY SF 01 UGB1 BONFANTI"), eq("2", "BY 01 UGB1 BONFANTI - CAMARA ROTORES"), eq("3", "MOINHO LAMINADOR SF 04 UGB1 BONFANTI"),
    eq("4", "BANBURY SF 02 UGB1 BONFANTI", true)];
  const cat = [m("50", "ANEL BONFANTI 1", "ANEL; MODELO: BMI-80T/80 L; FAB: BONFANTI - REF: 1."), m("51", "FILTRO BONFANTI 2", "MODELO: MIXER BMI80; FAB: BONFANTI"),
    m("52", "PINHAO BONFANTI 3", "APLICACAO: MISTURADOR BANBURY; MODELO: 80 L; FAB: BONFANTI"), m("53", "ROTOR BONFANTI 4", "MODELO: BMI-800; FAB: BONFANTI"),
    m("54", "CORDAO BONFANTI 5", "APLICACAO: MOINHO; MODELO: BMR 535X610X800; FAB: BONFANTI"), m("55", "ANEL BMI-80", "MODELO: BMI-80"),
    m("56", "ANEL BONFANTI 6", "MODELO: BMI-80; FAB: BONFANTI", "BLOQUEADO"),
    m("57", "MISTURADOR IND INT FINAL 80L INOX 380V", "MISTURADOR INDUSTRIAL; ACESSORIOS: MIXER BMI80; FAB: BONFANTI")];
  const v = vinculosDasRegras(equips, cat);
  it("só o Banbury Bonfanti ativo", () => expect([...v.keys()]).toEqual(["1"]));
  it("materiais Bonfanti BMI-80 aprovados", () => expect(v.get("1")!.materiais).toEqual(["50", "51", "52"]));
});

describe("regra: prensa a vácuo KCLKA EK76", () => {
  const m = (material: string, curta: string, completa = "", status = "APROVADO") => ({ material, descricaoCurta: curta, descrCompleta: completa, status });
  const equips = [eq("1", "PRENSA A VACUO 001"), eq("2", "PRENSA A VACUO 001 - ESTACAO 001"), eq("3", "PRENSA VACUO 01 - UNIDADE HIDRÁULICA"), eq("4", "BOMBA VACUO 40")];
  const cat = [m("60", "ANEL KCLKA 2080", "MODELO: EK76A-10; FAB: KCLKA"), m("61", "KIT BUSCH", "REQUISITOS ADICIONAIS: DA PRENSA VACUO KCLKA EK76-10"),
    m("62", "ANEL KCLKA 1", "MODELO: EK3-6E2"), m("63", "ANEL KCLKA 2", "MODELO: EK76A-10", "BLOQUEADO"), m("64", "ROLAMENTO", "REF: XEK760")];
  const v = vinculosDasRegras(equips, cat);
  it("só a prensa principal", () => expect([...v.keys()]).toEqual(["1"]));
  it("materiais EK76 aprovados", () => expect(v.get("1")!.materiais).toEqual(["60", "61"]));
});

describe("regra: prensa COPE PHB 450", () => {
  const m = (material: string, curta: string, completa = "", status = "APROVADO") => ({ material, descricaoCurta: curta, descrCompleta: completa, status });
  const equips = [eq("1", "PRENSA COPE 01 - PHB 450"), eq("2", "PLATÔ 1 - PRENSA COPE"), eq("3", "MOINHO LAMINADOR SF 01 UGB1 COPE")];
  const cat = [m("70", "TRAVA BANDEJA JOMAQ MOD.PHB450", "MODELO: PHB 450"), m("71", "PUXADOR", "FAB: ALPARGATAS - REF: PHB450.01."), m("72", "PINO", "MODELO: PBH 450"),
    m("73", "ROLO COPE", "MODELO: MOINHO"), m("74", "ANEL", "MODELO: PHB 4500"), m("75", "TRAVA", "MODELO: PHB 450", "BLOQUEADO")];
  const v = vinculosDasRegras(equips, cat);
  it("só a prensa principal", () => expect([...v.keys()]).toEqual(["1"]));
  it("materiais PHB/PBH 450 aprovados", () => expect(v.get("1")!.materiais).toEqual(["70", "71", "72"]));
});
