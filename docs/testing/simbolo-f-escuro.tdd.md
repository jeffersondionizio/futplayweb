# Símbolo F escuro

## Origem

Jornada derivada do pedido: como visitante, quero ver o símbolo “F” com verde mais escuro para que ele se destaque no cabeçalho.

## Evidências

| Garantia | Validação | Resultado |
|---|---|---|
| O símbolo usa o gradiente verde escuro definido | `node --test tests/cabecalho.test.mjs` | RED antes da alteração; GREEN depois |
| O aplicativo compila para produção | `npm run build` | PASS |
| A suíte de lógica existente continua íntegra | `npm test` | 12 testes PASS; cobertura global de linhas 99,69% |

O teste visual estático confere o gradiente em `Cabecalho.vue`. A aparência final deve ser conferida no navegador em larguras desktop e mobile.
