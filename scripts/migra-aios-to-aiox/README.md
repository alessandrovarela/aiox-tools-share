# Migração AIOS → AIOX

Script para migrar projetos que usam `.aios-core` para `.aiox-core`.

O script faz automaticamente:

- Cria um backup da pasta `.aios-core/`
- Renomeia `.aios-core/` → `.aiox-core/`
- Atualiza todas as referências nos arquivos do projeto (imports, configs, etc.)
- Detecta arquivos que você modificou no core e avisa antes de sobrescrever

## Pré-requisitos

- [Node.js](https://nodejs.org) instalado (v14+) — se você já usa AIOS/AIOX, já tem instalado 😉

## Como usar

### 1. Baixe o script

Baixe o arquivo [`migrate-aios-to-aiox.js`](./migrate-aios-to-aiox.js) e copie para dentro da **raiz do projeto** que será migrado.

### 2. Preview (simulação)

Antes de migrar, rode o script em modo `--dry-run` para ver o que será feito **sem alterar nada**:

```bash
cd /caminho/do/seu/projeto
node migrate-aios-to-aiox.js --dry-run
```

Ele vai listar:

- Quantos arquivos serão atualizados
- Quais referências serão substituídas
- Se existem arquivos que você modificou no core

Revise a saída e confirme que está tudo certo antes de prosseguir.

### 3. Migração real

Quando estiver pronto, rode sem a flag `--dry-run`:

```bash
node migrate-aios-to-aiox.js
```

Se o script detectar que você alterou arquivos dentro do `.aios-core/`, ele vai perguntar como proceder:

| Opção | O que faz |
|-------|-----------|
| **1** | Migra tudo, incluindo suas alterações |
| **2** | Migra apenas o framework (descarta suas alterações) |
| **3** | Cancela a migração |

### 4. Instalar o AIOX

```bash
npx aiox-core@latest install
```

Na instalação, escolha:

- Tipo de projeto: **Brownfield**

Na detecção de arquivos existentes:

| Arquivo | Ação |
|---------|------|
| `CLAUDE.md` | **merge** |
| `agents.md` | **merge** |
| `rules.md` | **merge** |
| `.env` | **skip** |

### 5. Após a instalação

Execute o diagnóstico para verificar que tudo está correto:

```bash
npx aiox-core doctor
```

### 6. Commit da migração

Entre no Claude Code e peça ao devops para fazer o commit:

```bash
claude
> @devops faça o commit da migração AIOS para AIOX
```

### 7. Limpeza

Quando estiver satisfeito com a migração, apague o backup:

**Mac / Linux:**
```bash
rm -rf .aios-backup-*
```

**Windows (CMD):**
```cmd
for /d %d in (.aios-backup-*) do rmdir /s /q "%d"
```

## Backup

O script **sempre** cria um backup automático antes de alterar qualquer coisa. A pasta de backup segue o formato:

```
.aios-backup-2026-03-15T10-30-00/
```

Se algo der errado, seus arquivos originais estarão lá.
