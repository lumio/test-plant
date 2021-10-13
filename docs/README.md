# Docs

This is just a simple demo on how to have plantUML rendered in a markdown file in GitHub Markdown files.

Just create a simple code block with the `puml` format and the `scripts/generate-puml.ts` takes care of the rest.

For example the following code block will result in an image:

    ```puml
    @startuml
    Alice -> Bob: Authentication Request
    Bob --> Alice: Authentication Response

    Alice -> Bob: Another authentication Request
    Alice <-- Bob: Another authentication Response
    @enduml
    ```

When running `npx ts-node scripts/generate-puml.ts` this is the output:

<!-- puml:3d69686b72944c72dca07e8358d9d7544986d9aecc994f7e31707b6d8587324e -->
![UML](generated-assets/3d69686b72944c72dca07e8358d9d7544986d9aecc994f7e31707b6d8587324e.svg)
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

---

This means that even multiple diagrams can be rendered with no problem

<!-- puml:1eaa518b726cfca05f3c061a25caabb9c3c237a1ed32b3923d80d68b7b492407 -->
![UML](generated-assets/1eaa518b726cfca05f3c061a25caabb9c3c237a1ed32b3923d80d68b7b492407.svg)
<details>
<summary>source code</summary>

```puml
@startuml
participant Participant as Foo
actor       Actor       as Foo1
boundary    Boundary    as Foo2
control     Control     as Foo3
entity      Entity      as Foo4
database    Database    as Foo5
collections Collections as Foo6
queue       Queue       as Foo7
Foo -> Foo1 : To actor 
Foo -> Foo2 : To boundary
Foo -> Foo3 : To control
Foo -> Foo4 : To entity
Foo -> Foo5 : To database
Foo -> Foo6 : To collections
Foo -> Foo7: To queue
@enduml
```
</details>

---

As this is just a demo on how to create some documentation, [links to other pages](subpage.md) should not be missed here.
Even [nested subpages](nested/subpage.md) are no big deal for GitHub.
