package lib

func Hello() string {
	return "hi"
}

type Greeter struct{}

func (g *Greeter) Greet() string {
	return Hello()
}
