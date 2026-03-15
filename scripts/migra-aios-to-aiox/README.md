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

### 1. Backup completo do projeto

Antes de qualquer coisa, faça um backup completo da pasta do seu projeto.

### 2. Baixe o script

Baixe o arquivo [`migrate-aios-to-aiox.js`](./migrate-aios-to-aiox.js) e copie para dentro da **raiz do projeto** que será migrado.

### 3. Preview (simulação opcional)

Antes de migrar, você pode rodar o script em modo `--dry-run` para ver o que será feito **sem alterar nada**:

```bash
cd /caminho/do/seu/projeto
node migrate-aios-to-aiox.js --dry-run
```

Ele vai listar:

- Quantos arquivos serão atualizados
- Quais referências serão substituídas
- Se existem arquivos que você modificou no core

Revise a saída e confirme que está tudo certo antes de prosseguir.

### 4. Migração real

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

### 5. Instalar o AIOX

```bash
npx aiox-core@latest install
```

Na instalação, escolha:

- Tipo de projeto: **Brownfield**

Na detecção de arquivos existentes:

| Arquivo | Ação | IDE |
|---------|------|------|
| `CLAUDE.md` | **merge** | **Claude Code** |
| `agents.md` | **merge** | **Codex** |
| `rules.md` | **merge** | **Gemini** |
| `.env` | **skip** | **skip** |

### Importante
A opção de escolher "merge" é para garantir que você não perca as alterações que você fez nos arquivos. Mas isso pode duplicar algumas regras. Isso será ajustado no passo 7

### 6. Após a instalação

Execute o diagnóstico para verificar que tudo está correto:

```bash
npx aiox-core doctor
```

### 7. Revisar arquivos mesclados

Entre no Claude Code e peça ao devops revisar os arquivos mesclados:

Exemplo se você mesclou o arquivo .claude/CLAUDE.md:

```bash
claude
> @devops revise o arquivo .claude/CLAUDE.md mesclado na migração para o AIOX. Verifique se há duplicação e ajuste. As regras antigas gerenciadas pelo AIOS podem ser excluidas.
```

### 8. Commit da migração

Peça ao devops para fazer o commit:

```bash
claude
> @devops faça o commit da migração AIOS para AIOX
```

### 9. Limpeza

Quando estiver satisfeito com a migração, apague o backup que foi feito da antiga pasta `.aios-core/`:

**Mac / Linux:**
```bash
rm -rf .aios-backup-*
```

**Windows (CMD):**
```cmd
for /d %d in (.aios-backup-*) do rmdir /s /q "%d"
```
