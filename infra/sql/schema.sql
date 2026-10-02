-- Schéma des deux bases d'Isaac.
--
-- Deux bases distinctes, et c'est voulu : l'une porte les données de
-- l'application, l'autre les vecteurs de la base de connaissances. Elles ne
-- partagent ni le port, ni le cycle de vie — effacer la seconde pour
-- réindexer ne touche pas à la première.
--
--   psql -U isaac -d isaac     -f schema.sql   (port 5433)
--   psql -U isaac -d isaac_kb  -f schema.sql   (port 5434)
--
-- Chaque bloc est inoffensif sur la base qui ne le concerne pas : les
-- CREATE sont conditionnels.


-- ============================================================ base isaac ==
--
-- UNE SEULE TABLE, clé-valeur. L'annuaire du personnel, les rendez-vous, le
-- journal des conversations, les comptes du back-office : tout y tient sous
-- une clé, en JSON.
--
-- Ce choix se défend par l'usage : ces données sont lues en entier et
-- écrites en entier, jamais interrogées par colonne. Une table par objet
-- aurait ajouté des migrations sans rien apporter.
--
-- Clés utilisées : 'staff', 'appointments', 'conversations', 'accounts'.

CREATE TABLE IF NOT EXISTS public.app_data (
    key        text        NOT NULL,
    value      jsonb       NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT app_data_pkey PRIMARY KEY (key)
);


-- ========================================================= base isaac_kb ==

CREATE EXTENSION IF NOT EXISTS vector;

-- Les morceaux de la base de connaissances, découpés et plongés. La colonne
-- `embedding` n'a pas de dimension fixée : le flux d'indexation la remplit
-- selon le modèle employé.
CREATE TABLE IF NOT EXISTS public.isaac_kb (
    id        uuid DEFAULT gen_random_uuid() NOT NULL,
    text      text,
    metadata  jsonb,
    embedding public.vector,
    CONSTRAINT isaac_kb_pkey PRIMARY KEY (id)
);

-- Les phrases de référence de la reconnaissance par le sens : plusieurs
-- formulations par intention, pour rattraper ce que les motifs écrits à la
-- main laissent passer.
--
-- 768 dimensions : c'est la taille de `nomic-embed-text`. Changer de modèle
-- de plongement demande de recréer cette table et de la réindexer.
CREATE TABLE IF NOT EXISTS public.faits_intentions (
    cle       text              NOT NULL,
    phrase    text              NOT NULL,
    embedding public.vector(768) NOT NULL
);

-- HNSW et non IVFFlat : le jeu est petit (quelques dizaines de phrases) et
-- ne grandit qu'à la main. HNSW ne demande pas d'être entraîné sur un
-- échantillon, ce qu'IVFFlat exige pour être utile.
CREATE INDEX IF NOT EXISTS faits_intentions_embedding_idx
    ON public.faits_intentions
    USING hnsw (embedding public.vector_cosine_ops);
