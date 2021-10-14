# test-plant

## How to run this manually

```shell
npx ts-node scripts/generate-puml.ts <glob-pattern>
```

<!-- puml:a98ef950f17ef0723a9dc39c2abb110fa7d2963b2402a943995a9229becfbe16 -->
![UML](docs/generated-assets/a98ef950f17ef0723a9dc39c2abb110fa7d2963b2402a943995a9229becfbe16.svg)
<details>
<summary>source code</summary>

```puml
@startuml
Alice -> Bob: Authentication Request1
Bob --> Alice: Authentication Response

Alice -> Bob: Another authentication Request
Alice <-- Bob: Another authentication Response
@enduml
```
</details>

You can also use files with the puml-extension as an image like so:

![linked puml](./docs/test.puml)
