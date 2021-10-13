# test-plant

## How to run this manually

```shell
npx ts-node scripts/generate-puml.ts <glob-pattern>
```

<!-- puml:3d69686b72944c72dca07e8358d9d7544986d9aecc994f7e31707b6d8587324e -->
![UML](docs/generated-assets/3d69686b72944c72dca07e8358d9d7544986d9aecc994f7e31707b6d8587324e.svg)
<details>
<summary>source code</summary>

```puml
@startuml
Alice -> Bob: Authentication Request
Bob --> Alice: Authentication Response

Alice -> Bob: Another authentication Request
Alice <-- Bob: Another authentication Response
@enduml
```
</details>