export type Partecipante = {
  id: string;
  nome: string;
};

export type ImpostazioniApp = {
  id: "app";
  partecipanti: Partecipante[];
  createdAt: string;
  updatedAt: string;
};
