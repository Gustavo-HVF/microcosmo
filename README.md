O nosso trabalho para a feira de ciências se baseia em uma área específica da educação que no caso é a biologia, onde a proposta é criar um site em que simula um microscópio e o objetivo é capturar essas formas de vida. 
Em geral o site é como se fosse um minigame onde o intuito é ensinar sobre as formas de vida microscópicas. O porquê desse projeto pela falta de uso dessa ferramenta no nosso ensino além de ser mais flexível para os alunos usarem é mais rápido e mais intuitivo.

## Como abrir

Abra `microcosmo/index.html` (ou o `index.html` da raiz, que leva até lá). Tudo funciona direto do computador, sem internet.

O **saguão** mostra três cartões; passe o mouse para eles inclinarem e clique para entrar (o cartão vira e entra na tela). As teclas `1`, `2` e `3` também escolhem. No celular, deslize para os lados e toque no cartão do meio.

## Estrutura (`microcosmo/`)

| Pasta | O que é |
|---|---|
| `index.html`, `saguao.css`, `saguao.js`, `img/` | Saguão com os três cartões e as imagens de cada parte |
| `jogo/` | O jogo do microscópio (`index.html`, `style.css`, `script.js`, `inicio.js`) |
| `apresentacao/` | Site do pitch para a Feira Tecnológica |
| `celulas-3d/` | Células em 3D (bactéria, lactobacilo, levedura e célula vegetal), abertas camada por camada |
| `comum/` | O que as páginas dividem: fontes, three.js e `entrada.js` (a passagem entre o saguão e cada parte) |

No jogo, os microrganismos são coletados com a pipeta (segure 5 s sobre eles); as algas grandes (Spirogyra, Oscillatoria, Closterium, Micrasterias e Vólvox) são longas demais para a pipeta e são **escaneadas** (segure o clique ou o dedo sobre elas por 3 s). Os desenhos dos organismos seguem fotos reais de microscópio.

O jogo abre as células 3D por cima dele, num quadro (botão "Modelos 3D das células" e "Ver a estrutura em 3D" na ficha), sem perder o que foi coletado. Cada parte tem um botão "← Início" para voltar ao saguão.

## Apresentação (`microcosmo/apresentacao/`)

Site de rolagem para apresentar o projeto na Feira Tecnológica. A página não desce: cada vez que você rola (ou aperta espaço/seta/passador de slides), a próxima informação aparece no lugar, com o motion inspirado no vídeo de referência (`297e7571f3711526.mp4`).

- **Controles:** rolar · espaço · ↓/↑ · `1`–`6` pula para cada parte · `F` tela cheia · `R` zera o cronômetro (clique nele para pausar).
- **Voltar ao saguão:** clique em "Microcosmo / pitch técnico" no canto de cima.
- **Nomes da equipe e turma:** edite o bloco `EQUIPE` no topo de `microcosmo/apresentacao/app.js` (e o rodapé de `microcosmo/index.html`).
- **Roteiro (segue o documento da feira):** 01 capa e identidade · 02 origem da ideia e problema real · 03 processo de engenharia · 04 diagrama de casos de uso · 05 aplicação prática · 06 conclusão.
