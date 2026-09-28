# -*- coding: utf-8 -*-
"""Gain brut de qwen3.5:4b par rapport a qwen2.5:7b, a prompt identique.

On interroge Ollama directement, sans passer par l'orchestration : les champs
prompt_eval_duration et eval_duration separent sans ambiguite la lecture du
prompt de la generation. C'est la methode du 24/09, qui avait etabli que le
prefill represente 88 pour cent du temps.

Le prompt reproduit la charge reelle : une consigne systeme, huit fragments de
contexte d'environ mille caracteres chacun, et une question. Sans cette masse,
on mesurerait un cas qui ne se produit jamais en production.
"""
import json
import subprocess
import time

OLLAMA = "http://127.0.0.1:11434/api/generate"
MODELES = ["qwen2.5:7b-instruct-q4_K_M", "qwen3.5:4b"]

FRAGMENT = (
    "ST DIGITAL est un operateur panafricain de services numeriques. "
    "Le Datacenter de Nkok, au Gabon, est certifie Tier III et heberge des "
    "infrastructures critiques. L'accueil est ouvert du lundi au vendredi de "
    "8h a 17h, ferme le week-end. Toute visite du Datacenter necessite un "
    "rendez-vous prealable, une piece d'identite et un accompagnement. "
) * 4  # environ mille caracteres

SYSTEME = (
    "Tu es Isaac, l'assistant d'accueil de ST DIGITAL. Tu reponds uniquement "
    "a partir du contexte fourni. Si l'information n'y figure pas, tu le dis "
    "clairement et tu orientes vers l'equipe. Tu n'inventes jamais."
)

QUESTIONS = [
    "Quels sont vos horaires d'ouverture ?",
    "Ou se trouve votre Datacenter ?",
    "Puis-je visiter le Datacenter seul, sans accompagnement ?",
]


def prompt(question):
    contexte = "\n\n".join("Document %d :\n%s" % (i + 1, FRAGMENT) for i in range(8))
    return "%s\n\nContexte :\n%s\n\nQuestion : %s\nReponse :" % (SYSTEME, contexte, question)


def interroge(modele, question):
    corps = json.dumps({
        "model": modele,
        "prompt": prompt(question),
        "stream": False,
        "options": {"temperature": 0, "num_predict": 250, "num_ctx": 8192, "num_thread": 4},
    })
    debut = time.time()
    r = subprocess.run(["curl", "-s", "--max-time", "600", "-X", "POST", OLLAMA,
                        "-H", "Content-Type: application/json", "-d", corps],
                       capture_output=True)
    total = time.time() - debut
    try:
        d = json.loads(r.stdout.decode("utf8"))
    except Exception:
        return None
    return {
        "total": total,
        "prefill": d.get("prompt_eval_duration", 0) / 1e9,
        "generation": d.get("eval_duration", 0) / 1e9,
        "jetons_prompt": d.get("prompt_eval_count", 0),
        "jetons_reponse": d.get("eval_count", 0),
        "texte": (d.get("response") or "").strip(),
    }


resume = {}
for modele in MODELES:
    print("=" * 78)
    print(modele)
    print("=" * 78)
    mesures = []
    for q in QUESTIONS:
        m = interroge(modele, q)
        if not m:
            print("  ECHEC sur : %s" % q)
            continue
        mesures.append(m)
        print("  %-52s %6.1f s  (lecture %5.1f + generation %5.1f)"
              % (q[:50], m["total"], m["prefill"], m["generation"]))
        print("      %d jetons lus, %d generes" % (m["jetons_prompt"], m["jetons_reponse"]))
        print("      %s" % " ".join(m["texte"].split())[:150])
    if mesures:
        moy = sum(m["total"] for m in mesures) / len(mesures)
        pre = sum(m["prefill"] for m in mesures) / len(mesures)
        gen = sum(m["generation"] for m in mesures) / len(mesures)
        resume[modele] = (moy, pre, gen)
        print("\n  moyenne : %.1f s  |  lecture %.1f s (%.0f %%)  |  generation %.1f s\n"
              % (moy, pre, 100 * pre / moy if moy else 0, gen))

print("=" * 78)
print("COMPARAISON")
print("=" * 78)
if len(resume) == 2:
    a, b = MODELES
    print("  %-30s %6.1f s" % (a, resume[a][0]))
    print("  %-30s %6.1f s" % (b, resume[b][0]))
    gain = 100 * (1 - resume[b][0] / resume[a][0])
    print("\n  gain du modele plus petit : %.0f %%" % gain)
    print("  latence attendue en production : environ %.0f s" % (resume[b][0] * (65 / resume[a][0]) if resume[a][0] else 0))
