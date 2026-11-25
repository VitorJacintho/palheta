# 🎸 Palheta — treino de guitarra

App instalável (PWA) para computador e celular, feito em HTML/JS puro — sem dependências nem build.

## O que ele faz

| Aba | Recursos |
|---|---|
| **Afinador** | Nota, ponteiro em cents, corda detectada automaticamente, 5 afinações (Padrão, Eb, Drop D, DADGAD, Open G), som de referência de cada corda e um detector de acordes ao vivo para testar o microfone. |
| **Tocar** | Escolha uma música → o app conta o tempo, mostra e **fala** o próximo acorde ("Ré menor"), mostra o desenho do acorde e acompanha você. No final dá uma **nota de 0 a 100** com precisão dos acordes, ritmo, estabilidade e dicas. |
| **Tablatura** | Treino de solo nota a nota a partir de uma tablatura em texto. Confere cada nota tocada, marca acertos/erros na tab e pontua acerto, ritmo e limpeza. |
| **Progresso** | Histórico de todos os treinos e estatísticas. |

### Modos de treino

- **Seguir meu ritmo** (acordes) / **Espera** (tab): o app espera *você* trocar de acorde/nota e se adapta ao seu andamento. O ritmo é avaliado em relação ao **seu próprio tempo** — não ao BPM original —, e a estabilidade mostra se você acelerou ou atrasou.
- **Metrônomo**: o clique dita o tempo; o app avalia se as palhetadas e as trocas caíram no tempo (em ms).
- **Gravar durações**: com o metrônomo fixo, você toca a música inteira; o app anota em que tempo cada troca aconteceu e salva as durações reais (útil porque a cifra não diz quanto dura cada acorde). Trocas que soam parecido (D → D7) são marcadas com o botão **Marcar troca** ou a tecla espaço.

As listas têm **busca** (título, artista, estilo) e filtros por **nível** e **Minhas**.

## Músicas: catálogo × minhas

- **Catálogo** (`catalog/`): vem com o app e é sempre a versão mais nova — corrigir uma música aqui atualiza todo mundo.
- **Minhas**: criadas no app (ou "Duplicar e editar" de uma do catálogo). Ficam só no aparelho.
- Durações gravadas numa música do catálogo ficam salvas no aparelho, por cima da versão do catálogo ("Voltar às originais" desfaz).
- **Copiar como texto** gera o arquivo da música no formato do catálogo — inclusive as durações gravadas.

## Adicionar uma música ao catálogo

1. Crie `catalog/songs/<id>.txt` (ex.: `raul-medo-da-chuva.txt`):

```
titulo: Medo da Chuva
artista: Raul Seixas
tom: D
capo: 0
bpm: 100
compasso: 4
nivel: iniciante              ← iniciante | intermediario | avancado
tags: rock, nacional
duracoes: 4 4 2 2 8 ...       ← opcional (vem do "Copiar como texto" depois de gravar)

[Intro]
| A7 | D | G . G5/F# . | D |

[Refrão]
G:8 D:8 G:8 D:8

Estrutura: Intro, Refrão, Refrão
```

2. Coloque o `<id>` em `catalog/index.json`.
3. Abra `/tests/` — a seção **Catálogo** confere a música (acordes, desenhos, detecção, estrutura, durações).

Tablaturas: mesmo esquema em `catalog/tabs/<id>.txt` (cabeçalho com `notas_por_tempo` e a tab em texto).

### Escrevendo a cifra

```
[Intro]                 ← nome da parte (ou "Intro:")
| G | D . C . |         ← compassos; cada "." estende o acorde anterior
G:2 C:2 D:4             ← duração em tempos
C G Am F (2x)           ← repete a linha
Estrutura: Intro, A, Refrão, B, Refrão   ← escreve cada parte uma vez só
# comentário
```

Dá para colar uma cifra inteira (de qualquer site): o app pega só as linhas de acordes e ignora a letra. Cada acorde vale um compasso.

## Rodar no computador

```powershell
powershell -ExecutionPolicy Bypass -File scripts\serve.ps1
```

Abra `http://localhost:5173` no Chrome ou Edge e clique em **Instalar app** (ou no ícone de instalar na barra de endereço).

## Instalar no celular

O microfone só funciona em **HTTPS**, então o app precisa estar publicado num endereço seguro. Opções gratuitas: **GitHub Pages**, **Netlify** ou **Cloudflare Pages** (é só subir a pasta inteira — não tem build).

- **Android (Chrome):** abra o endereço → menu ⋮ → *Instalar app*.
- **iPhone (Safari):** abra o endereço → Compartilhar → *Adicionar à Tela de Início*.

Depois da primeira abertura, ele funciona offline.

## Como a detecção funciona

- **Notas:** algoritmo YIN (frequência fundamental) — `js/audio/yin.js`.
- **Acordes:** cromagrama (energia de cada uma das 12 notas, a partir do espectro) comparado com modelos de acordes que incluem harmônicos — `js/audio/chroma.js`.
- **Palhetadas:** subida brusca de energia, localizada dentro do buffer de áudio com precisão de ~1 ms — `js/audio/engine.js`.
- **Atraso do áudio:** compensado nos modos com metrônomo. Em *Ajustes → Calibrar automaticamente* o app toca cliques e mede o atraso real do seu aparelho.

### Limitações

- O app reconhece a **altura** das notas, não a corda: a mesma nota em outra corda conta como certa.
- Bends, slides e vibratos podem confundir a detecção no modo tablatura.
- Em ambiente barulhento, diminua a *Sensibilidade* nos ajustes. Com fone de ouvido a voz e o metrônomo não vazam no microfone.

## Testes

Com o servidor rodando, abra `http://localhost:5173/tests/` — roda os testes de teoria, cifra, tablatura, detecção de nota (YIN) e reconhecimento de acordes.

Para testar sem guitarra, `tests/fake-guitar.js` simula um guitarrista pelo console do navegador:

```js
const g = await import('/tests/fake-guitar.js'); g.install();
// inicie um treino e então:
g.chords(['G', 'C', 'D'], 1.3);   // 1,3 s por acorde
```

## Estrutura

```
index.html, css/styles.css, manifest.webmanifest, sw.js, icons/
catalog/       músicas e tablaturas que vêm com o app (um .txt por item)
js/audio/      microfone, YIN, cromagrama
js/music/      teoria, leitor de cifra, formato de arquivo, tablatura, desenhos de acordes
js/practice/   sessões de acordes e de tablatura, pontuação
js/services/   armazenamento, voz, metrônomo e sons
js/ui/         telas
scripts/       servidor local e gerador de ícones
tests/         testes no navegador
```
