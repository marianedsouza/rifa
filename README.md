# Rifa com Causa

Plataforma de rifas por números com causa e identidade visual personalizada.
Cada campanha tem sua própria página, cores, logo, prêmio, valores e textos — sem alterar o código-fonte.

## Início rápido

```bash
npm install
npm run seed     # cria dados de exemplo (opcional)
npm start        # http://localhost:3000
```

Ou execute `iniciar.bat` no Windows (instala dependências, cria o banco e sobe o servidor).

## Acessos

- Página pública: http://localhost:3000/r/rifa-do-bem
- Painel administrativo: http://localhost:3000/admin
  - Admin: `admin@rifa.com` / `admin123`
  - Operador: `operador@rifa.com` / `operador123`

## Funcionalidades

- **Página pública da rifa**: hero, barra de progresso, causa, prêmio, como participar, contagem regressiva, regulamento e contato.
- **Grade de números** com estados: disponível, selecionado, reservado, pago e bloqueado. Seleção por clique, quantidade, pacotes e números aleatórios.
- **Checkout**: reserva temporária com contagem regressiva (tempo configurável), dados do participante com validação de CPF, resumo e desconto por pacotes.
- **Pagamento PIX**: QR Code + código copia-e-cola (padrão EMV), com confirmação. Na demo há o botão "Já fiz o pagamento (simulação)".
- **Comprovante** digital com código da participação e impressão/PDF.
- **Painel administrativo**: dashboard com vendas por dia, gerenciamento de rifas (assistente em etapas), identidade visual com preview em tempo real, números (bloquear/desbloquear), pedidos, participantes, sorteio com animação, gerador de arte, compartilhamento, relatórios CSV, usuários e permissões, logs e configurações.
- **Sorteio** considera apenas números com pagamento confirmado; resultado permanente e auditável.
- **Consulta de participação** por CPF ou código da participação.
- **Segurança**: transações SQLite (WAL), validação no backend, expiração automática de reservas e proteção contra reserva dupla.

## Estrutura

```
server.js              servidor Express
src/db.js              banco SQLite (node:sqlite nativo)
src/util.js            CPF, PIX EMV, CRC16, slug, uploads, senhas
src/auth.js            autenticação por token (HMAC)
src/routes/api.js      todas as rotas da API
public/                frontend (páginas públicas + painel admin)
scripts/seed.js        dados de demonstração
data/                  banco de dados (criado automaticamente)
uploads/               imagens enviadas
```

## Pagamento real

A arquitetura está preparada para integração com gateway de pagamento. O fluxo de PIX já gera o payload EMV (`pix_brcode`) e o QR Code. Para produção, conecte o webhook de confirmação do gateway ao endpoint de confirmação e desative o botão de simulação.

## Configurações principais

- Chave PIX: `Configurações → Chave PIX` (painel admin).
- Tempo de reserva: por rifa (padrão 10 min) e padrão nas configurações.
- Porta: `PORT` (padrão 3000). Segredo JWT: variável `JWT_SECRET`.
