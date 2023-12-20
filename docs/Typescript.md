# Typescript
Below is a breakdown of how to properly work with HyperExpress in Typescript project.


## Route Type Customization

`hyper-express` uses generics to custom `Requests` and `Routes` types and benefit from autocompletion and type checking.

```typescript

import { Server } from 'hyper-express';

const server = new Server();

// Classic syntax without type generic still works
server.get('/:id', (req, res) => {
	console.log(req.params.any)
});

// Each route methods can be customized using a generic. Here is a Params typed GET route
server.get<{Params : { id : number}}>('/:id', (req, res) => {
	console.log(req.params.id);
});

// When typed, Typescript will raise an error if handler doesn't match types,
server.get<{Params : { wrong : number}}>('/:id', (req, res) => { // ERROR : Argument of type "/:id"  is not assignable to parameter of type '`${string}/:wrong${string}`'.
	console.log(req.params.wrong);
	console.log(req.params.id); // ERROR : Property 'id' does not exist on type '{ wrong : string; }'.
});

// HTTP methods with a Body like POST can be customized with a Body property in the generic
server.post<{Body : { test : string }}>('/', (req, res) => {
	console.log(req.body.test);
	console.log(req.body.wrong); // ERROR : Property 'wrong' does not exist on type '{ test : string }'.
});


// You are also able to type JSON response
server.get<{Response : string}>('/', (req, res) => {
	res.json(2) // ERROR : json() method argument must be a string
});

```